"""Print GMB numbers for explicit source year/make/model/engine selections.

Uses the native anonymous vehicle filter, not an undocumented parts endpoint.
No import/store API calls. Session-dependent catalogue pages bypass the local
cache and are retained in the required raw-response sidecar instead.
"""
import argparse
import json
import re
import sys
from pathlib import Path
from urllib.parse import urljoin, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from bs4 import BeautifulSoup

from parsers.adapters.gmb import AJAX_URL, CATALOG_URL, GmbAdapter, product_links
from parsers.http import PoliteSession, RateLimiter, ResponseCache, SourceError


def _choices(data, id_field, name_field):
    if not isinstance(data, list):
        raise SourceError("GMB vehicle choices are not a list")
    result = {}
    for row in data:
        if not isinstance(row, dict) or row.get(id_field) is None or not isinstance(row.get(name_field), str):
            raise SourceError("GMB vehicle choice fields changed")
        identity, label = str(row[id_field]), row[name_field]
        if not re.fullmatch(r"[0-9]+", identity) or not label:
            raise SourceError("GMB vehicle choice identity is invalid")
        if identity in result and result[identity] != label:
            raise SourceError("GMB vehicle choice labels conflict")
        result[identity] = label
    return result


def harvest(adapter, year, makes, models=None, max_models=None, max_products=None):
    wanted_makes = {x.casefold() for x in makes}
    wanted_models = {x.casefold() for x in (models or [])}
    http = adapter.http
    page = adapter._fetch(CATALOG_URL, use_cache=False)
    soup = BeautifulSoup(page, "html.parser")
    if str(year) not in {x.get("value") for x in soup.select('#selected_year option')}:
        raise SourceError("Requested GMB year is not a published source option")
    choices = adapter._json(lookup="make", year=str(year), make="", model="", engine="")
    make_options = _choices(choices, "makeId", "makeName")
    found, processed_models = {}, 0
    for make_id, make in make_options.items():
        if make.casefold() not in wanted_makes:
            continue
        choices = adapter._json(lookup="model", year=str(year), make=make_id, model="", engine="")
        model_options = _choices(choices, "baseVehicleId", "modelName")
        for model_id, model in model_options.items():
            if wanted_models and model.casefold() not in wanted_models:
                continue
            if max_models is not None and processed_models >= max_models:
                return list(found)
            processed_models += 1
            choices = adapter._json(lookup="engine", year=str(year), make=make_id, model=model_id, engine="")
            engines = _choices(choices, "attributeValueId", "attributeValueName")
            for engine_id in engines:
                body = {"action": "ymm_string", "year": str(year), "make": make, "model": model,
                        "fitment_params[year]": str(year), "fitment_params[make]": make_id,
                        "fitment_params[model]": model_id, "fitment_params[part_type]": "",
                        "fitment_params[engine]": engine_id}
                adapter._pace()
                accepted = http.fetch_json(AJAX_URL, method="POST", form_body=body, use_cache=False)
                if accepted is not True:
                    raise SourceError("GMB native vehicle filter was not accepted")
                params = {"selected_year": str(year), "selected_make": make_id,
                          "selected_model": model_id, "selected_engine": engine_id}
                url, seen = CATALOG_URL, set()
                expected = "Showing Results For " + str(year) + " " + make + " " + model
                while True:
                    html = adapter._fetch(url, params=params, use_cache=False)
                    page = BeautifulSoup(html, "html.parser")
                    verification = page.select_one('#filter-verification')
                    if not verification or verification.get_text(" ", strip=True) != expected:
                        raise SourceError("GMB catalogue does not confirm the requested vehicle filter")
                    for number, _, _ in product_links(html):
                        found.setdefault(number, None)
                        if max_products is not None and len(found) >= max_products:
                            return list(found)
                    next_page = page.select_one('a.next.page-numbers[href]')
                    if not next_page:
                        break
                    url = urljoin(CATALOG_URL, next_page['href'])
                    address = urlsplit(url)
                    if address.scheme != "https" or address.hostname != "gmb.net" or not re.fullmatch(r"/catalog/page/[0-9]+/?", address.path) or url in seen:
                        raise SourceError("GMB filtered catalogue pagination is invalid")
                    seen.add(url)
    return list(found)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--year", type=int, required=True)
    parser.add_argument("--makes", nargs="+", required=True)
    parser.add_argument("--models", nargs="*")
    parser.add_argument("--max-models", type=int)
    parser.add_argument("--max-products", type=int)
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--record-output", type=Path, required=True)
    args = parser.parse_args()
    if args.record_output.exists():
        raise FileExistsError("Raw-response output must be a new file")
    if any(x is not None and x < 1 for x in (args.max_models, args.max_products)):
        parser.error("Trial limits must be positive")
    http = PoliteSession(cache=ResponseCache(args.cache), limiter=RateLimiter(5))
    http.recorder = []
    adapter = GmbAdapter(http)
    # Even a failed collection retains the responses behind the failure.
    try:
        numbers = harvest(adapter, args.year, args.makes, args.models, args.max_models, args.max_products)
    finally:
        args.record_output.parent.mkdir(parents=True, exist_ok=True)
        documents = [{**d, "source_key": adapter.name, "source_name": adapter.source.name,
                      "parser_name": adapter.name, "parser_version": adapter.version} for d in http.recorder]
        with args.record_output.open("x", encoding="utf-8") as stream:
            json.dump({"documents": documents}, stream, ensure_ascii=False)
    print("\n".join(numbers))


if __name__ == "__main__":
    main()
