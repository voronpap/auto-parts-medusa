"""Print one ZF-group brand's catalogue numbers for selected vehicle makes.

This is a read-only list builder: no catalogue database writes or import.
Use a separate cache file and --max-models/--max-pages for a short trial.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from parsers.adapters.base import label_has_brand
from parsers.adapters.zf import BRAND_IDS
from parsers.http import PoliteSession, ResponseCache

BASE_URL = "https://aftermarket.zf.com/functions/controller/opc"


def collect_numbers(http, makes, part_brand, *, models=None, max_models=None, max_pages=None):
    common = {"languageID": 4, "brandIDs": BRAND_IDS[part_brand], "countryID": "UA", "vehicleTypeIDs": "P"}

    def get(path, **params):
        return http.fetch_json(f"{BASE_URL}/{path}", params={**common, **params},
                               headers={"X-Requested-With": "XMLHttpRequest"})

    manufacturers = get("getManufacturers").get("content") or []
    seen = set()
    for make in makes:
        selected = [m for m in manufacturers if label_has_brand(str(m.get("name") or ""), make)]
        if not selected:
            print(f"{make}: not listed by ZF", file=sys.stderr)
        for manufacturer in selected:
            make_id = manufacturer["manufacturerID"]
            found_models = get("getModels", manufacturerID=make_id).get("content") or []
            if models:
                found_models = [m for m in found_models if any(s.casefold() in str(m.get("name") or "").casefold() for s in models)]
            for model in found_models[:max_models]:
                model_id = model["modelID"]
                vehicles = get("getGroupedVehicles", modelID=model_id).get("content") or []
                ids = list(dict.fromkeys(str(i) for vehicle in vehicles for i in vehicle.get("vehicleIDs") or []))
                if not ids:
                    continue
                page = 0
                while True:
                    data = get("getArticlesForFilter", limitToBrandIDs=BRAND_IDS[part_brand],
                               manufacturerID=make_id, modelID=model_id, vehicleIDs=",".join(ids),
                               assemblyGroupIDs="", sort="asc", sortField="status", count=15,
                               page=page, criteriaIDAndValue="", status="",
                               oneMainAssemblyGroupSelected="false", articlePartIDs="")
                    for item in data.get("content") or []:
                        number = str(item.get("articleID") or "")
                        if number and label_has_brand(str(item.get("brandName") or ""), part_brand) and number not in seen:
                            seen.add(number)
                            yield number
                    total_pages = int(data.get("totalPages") or 0)
                    if page + 1 >= total_pages:
                        break
                    if max_pages is not None and page + 1 >= max_pages:
                        print(f"{make} {model.get('name')}: stopped after {max_pages}/{total_pages} pages", file=sys.stderr)
                        break
                    page += 1
                print(f"{make} {model.get('name')}: {data.get('totalElements', 0)} catalogue rows", file=sys.stderr)


def positive(value):
    number = int(value)
    if number < 1:
        raise argparse.ArgumentTypeError("must be positive")
    return number


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--brands", nargs="+", required=True, help="vehicle makes, e.g. MG HAVAL CHERY")
    parser.add_argument("--part-brand", choices=tuple(BRAND_IDS), required=True)
    parser.add_argument("--models", nargs="+", help="optional substrings of model names")
    parser.add_argument("--max-models", type=positive)
    parser.add_argument("--max-pages", type=positive)
    parser.add_argument("--cache", type=Path, required=True)
    args = parser.parse_args()
    http = PoliteSession(cache=ResponseCache(args.cache))
    for number in collect_numbers(http, args.brands, args.part_brand, models=args.models,
                                  max_models=args.max_models, max_pages=args.max_pages):
        print(number, flush=True)


if __name__ == "__main__":
    main()
