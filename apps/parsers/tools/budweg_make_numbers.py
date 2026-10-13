"""Collect visible Budweg numbers from the native public vehicle filter.

No login, downloads, store imports, guessed endpoint or pagination repair.
Use explicit trial limits to inspect an incomplete collection. A required
new sidecar retains successful HTTP responses even when collection fails.
"""
import argparse
import json
import sys
from pathlib import Path
from urllib.parse import parse_qs, urljoin, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from bs4 import BeautifulSoup

from parsers.adapters.budweg import CATALOG_URL, BudwegAdapter, product_number, valid_number
from parsers.http import PoliteSession, RateLimiter, ResponseCache, SourceError


def catalogue_numbers(html, make):
    soup = BeautifulSoup(html, "html.parser")
    if not soup.title or "Catalogue" not in soup.title.get_text() or "Budweg" not in soup.title.get_text():
        raise SourceError("Budweg catalogue page identity is missing")
    holder = soup.select_one(".catalog-right")
    headings = holder.select(".catalog-title") if holder else []
    if not headings:
        raise SourceError("Budweg catalogue has no verifiable vehicle rows")
    found = {}
    for heading in headings:
        if not heading.get_text(" ", strip=True).startswith(make + " "):
            raise SourceError("Budweg catalogue returned an unrequested vehicle make")
        block = heading.find_next_sibling()
        if not block or "table-responsive" not in block.get("class", []):
            raise SourceError("Budweg vehicle table structure changed")
        table = block.select_one("table.catalog-table")
        if not table or not table.select_one(".table-head .title-td"):
            raise SourceError("Budweg vehicle table headings are missing")
        for link in table.select("a.hint[href]"):
            code = product_number(link)
            if valid_number(code):
                found.setdefault(code, None)
    return list(found), soup


def harvest(adapter, makes, max_pages=None, max_numbers=None):
    initial = adapter._fetch(CATALOG_URL)
    soup = BeautifulSoup(initial, "html.parser")
    choices = {x.get_text(" ", strip=True).casefold(): x["value"] for x in soup.select('select[name="brand"] option[value]') if x["value"]}
    if not choices:
        raise SourceError("Budweg published make options are missing")
    missing = [x for x in makes if x.casefold() not in choices]
    if missing:
        raise SourceError("Requested Budweg make is not a published option: " + ", ".join(missing))
    found = {}
    for make in dict.fromkeys(choices[x.casefold()] for x in makes):
        filters = {"search": "", "brand": make, "model": "", "fromYear": "", "engine": "", "fuel": "", "model_code": ""}
        url, params, page, seen = CATALOG_URL, filters, 1, set()
        while True:
            html = adapter._fetch(url, params=params)
            codes, current = catalogue_numbers(html, make)
            for code in codes:
                found.setdefault(code, None)
                if max_numbers is not None and len(found) >= max_numbers:
                    return list(found)
            marker = current.select_one(".pagination .page-numbers.current")
            if marker and marker.get_text(strip=True) != str(page):
                raise SourceError("Budweg vehicle pagination returned the wrong page")
            next_link = current.select_one(".pagination a.next.page-numbers[href]")
            if max_pages is not None and page >= max_pages:
                break
            if not next_link:
                later = [x for x in current.select(".pagination a.page-numbers[href]")
                         if x.get_text(strip=True).isdigit() and int(x.get_text(strip=True)) > page]
                if later:
                    raise SourceError("Budweg vehicle pagination advertises later records but lacks its next link")
                break
            url = urljoin(CATALOG_URL, next_link["href"])
            parsed = urlsplit(url)
            query = parse_qs(parsed.query, keep_blank_values=True)
            if (parsed.scheme != "https" or parsed.netloc != "budweg-catalog.com" or parsed.fragment
                    or parsed.path != f"/catalogue/page/{page + 1}/" or url in seen
                    or set(query) != set(filters) or any(query.get(k) != [v] for k, v in filters.items())):
                raise SourceError("Budweg vehicle pagination lost or changed the native filter")
            seen.add(url)
            params, page = None, page + 1
    return list(found)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--makes", nargs="+", required=True)
    parser.add_argument("--max-pages", type=int)
    parser.add_argument("--max-numbers", type=int)
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--record-output", type=Path, required=True)
    args = parser.parse_args()
    if args.record_output.exists():
        raise FileExistsError("Raw response sidecar must be a new file")
    if any(x is not None and x < 1 for x in (args.max_pages, args.max_numbers)):
        parser.error("Trial limits must be positive")
    http = PoliteSession(cache=ResponseCache(args.cache), limiter=RateLimiter(5))
    http.recorder = []
    adapter, completed = BudwegAdapter(http), False
    try:
        numbers = harvest(adapter, args.makes, args.max_pages, args.max_numbers)
        completed = True
    finally:
        documents = [{**d, "source_key": adapter.source.key, "source_name": adapter.source.name,
                      "parser_name": adapter.name, "parser_version": adapter.version} for d in http.recorder]
        args.record_output.parent.mkdir(parents=True, exist_ok=True)
        with args.record_output.open("x", encoding="utf-8") as stream:
            json.dump({"documents": documents, "collection_succeeded": completed,
                       "complete_collection": completed and args.max_pages is None and args.max_numbers is None,
                       "trial_limits": {"max_pages": args.max_pages, "max_numbers": args.max_numbers}}, stream, ensure_ascii=False)
    print("\n".join(numbers))


if __name__ == "__main__":
    main()
