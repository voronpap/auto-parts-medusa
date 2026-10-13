"""Print Nissens numbers for vehicle makes without importing any data.

    python tools/nissens_make_numbers.py --brands MG CHERY BYD --cache /tmp/nissens.sqlite
"""
from __future__ import annotations

import argparse
from itertools import islice
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from bs4 import BeautifulSoup
from parsers.adapters.base import label_has_brand
from parsers.adapters.nissens import CATALOG_URL, NissensAdapter
from parsers.http import PoliteSession, ResponseCache


def harvest(http: PoliteSession, brands: list[str], max_pages: int | None = None) -> list[str]:
    soup = BeautifulSoup(http.fetch(CATALOG_URL), "html.parser")
    selector = soup.select_one('select[name="SearchParameters.ManufacturerID"]')
    if selector is None:
        return []
    adapter = NissensAdapter(http)
    numbers: dict[str, None] = {}
    for option in selector.select("option[value]"):
        label = option.get_text(" ", strip=True)
        if not any(label_has_brand(label, brand) for brand in brands):
            continue
        pages = adapter._search_pages("ManufacturerID", str(option["value"]))
        if max_pages is not None:
            pages = islice(pages, max_pages)
        for page in pages:
            for hit in page:
                numbers.setdefault(hit.number, None)
        print(f"{label}: {len(numbers)} unique numbers so far", file=sys.stderr)
    return list(numbers)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--brands", nargs="+", required=True)
    parser.add_argument("--max-pages", type=int)
    parser.add_argument("--cache", required=True, help="dedicated response cache")
    args = parser.parse_args()
    http = PoliteSession(cache=ResponseCache(Path(args.cache)))
    for number in harvest(http, args.brands, args.max_pages):
        print(number)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
