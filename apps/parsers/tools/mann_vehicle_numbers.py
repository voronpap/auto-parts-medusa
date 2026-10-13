"""Lists the MANN-FILTER or FILTRON products the catalogue gives for vehicle makes.

    .venv/bin/python tools/mann_vehicle_numbers.py mann-filter CHERY GEELY > numbers.txt

Walks the catalogue's own tree make -> model series -> model type -> products
through its API, politely paced and cached, and prints one product number per
line. The numbers are then looked up one by one with `import-numbers`, which
brings each product's full fitment and crosses into the catalog.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, ".")
from parsers.adapters.mann_hummel import FiltronAdapter, MannFilterAdapter  # noqa: E402
from parsers.http import PoliteSession, RateLimiter, ResponseCache, SourceError  # noqa: E402

ADAPTERS = {"mann-filter": MannFilterAdapter, "filtron": FiltronAdapter}

BRANDS = (
    'query($s:String!){smart_search(search:$s pageSize:20 currentPage:1 applicationSegmentId:"")'
    "{applications{brands{brand_name vehicle_brand_id vehicle_brand_category_id}}}}"
)
MODELS = (
    'query($brand:String!$category:String!){modelCollectionByBrandId(vehicle_brand_id:$brand '
    'vehicle_category_id:$category model_name:"" pageSize:500 currentPage:1)'
    "{models{model_series_id model_series_name}}}"
)
TYPES = "query($id:String!){modelTypeCollection(model_series_id:$id){allModelTypes{model_type_id vehicle_name}}}"
PRODUCTS = (
    "query($id:String!$page:Int!){productLinkageCollection(vehicle_model_type_id:$id pageSize:100 currentPage:$page)"
    "{items{product{sku sales_designation}}page_info{total_pages}}}"
)


def log(*parts: object) -> None:
    print(*parts, file=sys.stderr, flush=True)


def main() -> None:
    name, makes = sys.argv[1], sys.argv[2:]
    limiter = RateLimiter(5.0)
    http = PoliteSession(cache=ResponseCache(Path(".cache/responses.sqlite")), limiter=limiter)
    adapter = ADAPTERS[name](http)
    numbers: dict[str, set[str]] = {}

    for make in makes:
        series: list[dict] = []
        seen_series: set[str] = set()
        applications = (adapter._api(BRANDS, {"s": make})["data"]["smart_search"] or {}).get("applications") or []

        for application in applications:
            for brand in application.get("brands") or []:
                # The search is fuzzy: only the make that was asked for counts.
                if make.lower() not in (brand.get("brand_name") or "").lower():
                    continue

                models = (
                    adapter._api(
                        MODELS,
                        {"brand": brand["vehicle_brand_id"], "category": brand.get("vehicle_brand_category_id") or ""},
                    )["data"]["modelCollectionByBrandId"]
                    or {}
                ).get("models") or []

                for model in models:
                    if model["model_series_id"] not in seen_series:
                        seen_series.add(model["model_series_id"])
                        series.append(model)

        log(f"{make}: {len(series)} model series")

        for model in series:
            try:
                types = (
                    adapter._api(TYPES, {"id": model["model_series_id"]})["data"]["modelTypeCollection"] or {}
                ).get("allModelTypes") or []
            except SourceError as error:
                log(f"  {model['model_series_name']}: {error}")
                continue

            found: set[str] = set()

            for model_type in types:
                page = 1

                while True:
                    try:
                        data = (
                            adapter._api(PRODUCTS, {"id": model_type["model_type_id"], "page": page})["data"][
                                "productLinkageCollection"
                            ]
                            or {}
                        )
                    except SourceError as error:
                        log(f"  {model_type['vehicle_name']}: {error}")
                        break

                    for item in data.get("items") or []:
                        number = ((item.get("product") or {}).get("sales_designation") or "").strip()

                        if number:
                            found.add(number)
                            numbers.setdefault(number, set()).add(make)

                    if page >= ((data.get("page_info") or {}).get("total_pages") or 1):
                        break

                    page += 1

            log(f"  {model['model_series_name']}: {len(types)} types, {len(found)} products")

    log(json.dumps({"products": len(numbers)}))

    for number in sorted(numbers):
        print(number)


if __name__ == "__main__":
    main()
