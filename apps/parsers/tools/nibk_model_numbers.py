"""Print NiBK part numbers for selected makes without importing any data.

    python tools/nibk_model_numbers.py --brands GEELY HAVAL "MG" --cache /tmp/nibk.sqlite
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from bs4 import BeautifulSoup
from parsers.adapters.base import label_has_brand, normalize_brand
from parsers.adapters.nibk import BASE_URL, CATALOG_URL, product_links
from parsers.http import PoliteSession, ResponseCache

AJAX = {"X-Requested-With": "XMLHttpRequest"}


def options(html: str) -> list[tuple[str, str]]:
    soup = BeautifulSoup(html, "html.parser")
    return [(str(o.get("value")), o.get_text(" ", strip=True))
            for o in soup.select("option[value]") if o.get("value") not in ("", "0")]


def ajax_options(http: PoliteSession, path: str) -> list[tuple[str, str]]:
    # The site's jQuery selector requests use this header and return a JSON
    # string containing <option> nodes, not a product database or API key.
    body = http.fetch_json(f"{BASE_URL}{path}", headers=AJAX)
    return options(body) if isinstance(body, str) else []


def harvest(http: PoliteSession, brands: list[str], max_models: int | None = None) -> list[str]:
    soup = BeautifulSoup(http.fetch(CATALOG_URL), "html.parser")
    selector = soup.select_one("#selBrand")
    makers = options(str(selector)) if selector else []
    found: dict[str, None] = {}
    requested = set(normalize_brand(b) for b in brands)
    for make_id, label in makers:
        if not (any(label_has_brand(label, b) for b in brands)
                or ("greatwall" in requested and normalize_brand(label) == "greatwallmotors")):
            continue
        classes = ajax_options(http, f"/application/get_application_class/{make_id}/1") or [("0", "")]
        count = 0
        for class_id, _ in classes:
            models = ajax_options(http, f"/application/get_application_models/{make_id}/1/{class_id}")
            for model_id, model in models:
                if max_models is not None and count >= max_models:
                    break
                count += 1
                html = http.fetch(
                    f"{BASE_URL}/application/get_applications/{model_id}/1/{class_id}/0/0",
                    params={"body_value": "0", "eng_no": "0"}, headers=AJAX,
                )
                for code, _ in product_links(html):
                    found.setdefault(code, None)
                print(f"{label} {model}: {len(found)} unique numbers so far", file=sys.stderr)
    return list(found)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--brands", nargs="+", required=True)
    parser.add_argument("--max-models", type=int)
    parser.add_argument("--cache", required=True, help="use a dedicated response cache")
    args = parser.parse_args()
    http = PoliteSession(cache=ResponseCache(Path(args.cache)))
    for number in harvest(http, args.brands, args.max_models):
        print(number)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
