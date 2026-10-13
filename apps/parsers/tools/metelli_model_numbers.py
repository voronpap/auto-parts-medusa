"""Print Metelli Group own numbers through the public vehicle catalogue.

Select one part brand explicitly. Follow source links only, and confirm the
visible product code: sibling brands use Metelli internal codes in URLs.
Trial bounds intentionally produce a partial list, never imply full coverage.
"""
import argparse
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from bs4 import BeautifulSoup

from parsers.adapters.base import label_has_brand
from parsers.adapters.metelli import BASE_URL, BRANDS, _safe_url, hit_matches_product, parse_product, parse_search
from parsers.http import PoliteSession, RateLimiter, ResponseCache

START_URL = f"{BASE_URL}/en/Home/AdvancedSearch"


def _links(html, action, context):
    seen = set()
    for node in BeautifulSoup(html, "html.parser").select("a[href]"):
        url = _safe_url(str(node["href"]))
        if not url or urlsplit(url).path.rsplit("/", 1)[-1].casefold() != action.casefold():
            continue
        params = parse_qs(urlsplit(url).query)
        if not all(params.get(key) == [value] for key, value in context.items()):
            continue
        if url not in seen:
            seen.add(url)
            yield node.get_text(" ", strip=True), url, {k: v[0] for k, v in params.items()}


def harvest(http, makes, part_brand, models=None, max_models=None, max_versions=None, max_products=None):
    brand_key = next((key for key, name in BRANDS.items() if label_has_brand(name, part_brand)), None)
    if not brand_key:
        raise ValueError("Unknown Metelli Group part brand")
    soup = BeautifulSoup(http.fetch(START_URL), "html.parser")
    seen_urls, seen_numbers = set(), set()
    checked = 0
    for make in soup.select("#vehicle option[value]"):
        if str(make["value"]) in ("", "0", "-1") or not any(label_has_brand(make.get_text(" ", strip=True), m) for m in makes):
            continue
        context = {"brand": brand_key, "make": str(make["value"])}
        # Same public route used by the vehicle selector; no guessed IDs.
        html = http.fetch(f"{BASE_URL}/en/Home/VehicleModels", params=context)
        model_links = [link for link in _links(html, "VehicleVersions", context)
                       if not models or any(m.casefold() in link[0].casefold() for m in models)]
        for _, model_url, model_context in model_links[:max_models]:
            versions = list(_links(http.fetch(model_url), "ProductFamily", model_context))
            for _, version_url, version_context in versions[:max_versions]:
                families = list(_links(http.fetch(version_url), "PartList", version_context))
                all_parts = next((link for link in families if "family" not in link[2]), None)
                for _, parts_url, _ in [all_parts] if all_parts else families:
                    for hit in parse_search(http.fetch(parts_url)):
                        if hit.brand != BRANDS[brand_key] or hit.url in seen_urls:
                            continue
                        if max_products is not None and checked >= max_products:
                            return
                        seen_urls.add(hit.url)
                        checked += 1
                        product = parse_product(http.fetch(hit.url), hit.url)
                        if not hit_matches_product(hit, product):
                            continue
                        if product.number not in seen_numbers:
                            seen_numbers.add(product.number)
                            yield product.number


def positive(value):
    number = int(value)
    if number < 1:
        raise argparse.ArgumentTypeError("must be positive")
    return number


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--brands", nargs="+", required=True, help="vehicle makes, e.g. CHERY MG HAVAL")
    parser.add_argument("--part-brand", choices=list(BRANDS.values()), required=True)
    parser.add_argument("--models", nargs="+", help="model-name substrings")
    parser.add_argument("--max-models", type=positive, help="trial limit per make")
    parser.add_argument("--max-versions", type=positive, help="trial limit per model")
    parser.add_argument("--max-products", type=positive, help="trial limit on checked products")
    parser.add_argument("--cache", type=Path, required=True)
    args = parser.parse_args()
    http = PoliteSession(cache=ResponseCache(args.cache), limiter=RateLimiter(5))
    for number in harvest(http, args.brands, args.part_brand, args.models, args.max_models, args.max_versions, args.max_products):
        print(number)


if __name__ == "__main__":
    main()
