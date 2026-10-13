"""Print CTR own numbers after confirming explicit fitment for selected makes."""
import argparse
from pathlib import Path

from parsers.adapters.base import label_has_brand
from parsers.adapters.ctr import CtrAdapter
from parsers.http import PoliteSession, RateLimiter, ResponseCache


def harvest(http, makes, max_pages=None, max_products=None):
    adapter = CtrAdapter(http)
    seen, checked = set(), 0
    for make in makes:
        for hit in adapter.search(make, "car", max_pages):
            if max_products is not None and checked >= max_products:
                return
            checked += 1
            data, _ = adapter.detail(hit)
            if not data or not any(label_has_brand(a.get("make") or "", make) for a in data.get("applicationList", [])):
                continue
            if data["ctrno"] not in seen:
                seen.add(data["ctrno"])
                yield data["ctrno"]


def positive(value):
    value = int(value)
    if value < 1:
        raise argparse.ArgumentTypeError("must be positive")
    return value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--brands", nargs="+", required=True)
    parser.add_argument("--max-pages", type=positive, help="trial limit per make; otherwise all pages")
    parser.add_argument("--max-products", type=positive, help="trial limit on checked products")
    parser.add_argument("--cache", type=Path, required=True)
    args = parser.parse_args()
    http = PoliteSession(cache=ResponseCache(args.cache), limiter=RateLimiter(5))
    for number in harvest(http, args.brands, args.max_pages, args.max_products):
        print(number)


if __name__ == "__main__":
    main()
