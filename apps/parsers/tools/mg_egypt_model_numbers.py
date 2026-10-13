"""Print native MG Egypt codes with explicit model/category fitment."""
import argparse
from pathlib import Path

from parsers.adapters.mg_egypt import MgEgyptAdapter
from parsers.http import PoliteSession, RateLimiter, ResponseCache


def harvest(http, models=None, categories=None):
    seen = set()
    for row in MgEgyptAdapter(http).rows():
        if models and not any(row.model.casefold() == model.casefold() for model in models):
            continue
        if categories and not any(row.category.casefold() == c.casefold() for c in categories):
            continue
        if row.number not in seen:
            seen.add(row.number)
            yield row.number


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--models", nargs="+")
    parser.add_argument("--categories", nargs="+")
    parser.add_argument("--cache", type=Path, required=True)
    args = parser.parse_args()
    http = PoliteSession(cache=ResponseCache(args.cache), limiter=RateLimiter(5))
    for number in harvest(http, args.models, args.categories):
        print(number)


if __name__ == "__main__":
    main()
