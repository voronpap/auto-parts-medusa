"""Print exact Geely own numbers from the regional public model tables."""
import argparse
from pathlib import Path

from parsers.adapters.geely_ksa import CATALOG_URL, parse_rows
from parsers.http import PoliteSession, RateLimiter, ResponseCache


def harvest(http, models=None):
    seen = set()
    for row in parse_rows(http.fetch(CATALOG_URL)):
        if models and not any(model.casefold() == row.model.casefold() for model in models):
            continue
        if row.number not in seen:
            seen.add(row.number)
            yield row.number


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--models", nargs="+", help="exact model names, e.g. MONJARO STARRAY")
    parser.add_argument("--cache", type=Path, required=True)
    args = parser.parse_args()
    http = PoliteSession(cache=ResponseCache(args.cache), limiter=RateLimiter(20))
    for number in harvest(http, args.models):
        print(number)


if __name__ == "__main__":
    main()
