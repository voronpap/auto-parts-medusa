"""Lists the Febest products the catalogue gives for vehicle makes.

    .venv/bin/python tools/febest_model_numbers.py CHERY GEELY > numbers.txt

Reads the catalogue's own search by vehicle, page by page, politely paced,
and prints one product code per line for `import-numbers`.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path
from urllib.parse import quote

sys.path.insert(0, ".")
from parsers.adapters.febest import CATALOG_URL, parse_list  # noqa: E402
from parsers.http import PoliteSession, RateLimiter, ResponseCache  # noqa: E402

http = PoliteSession(cache=ResponseCache(Path(".cache/responses.sqlite")), limiter=RateLimiter(5.0))
codes: set[str] = set()

for make in sys.argv[1:]:
    page, pages, found = 1, 1, 0

    while page <= pages:
        path = "" if page == 1 else f"/page/{page}"
        html = http.fetch(f"{CATALOG_URL}{path}?model={quote(make)}")
        pages = max([pages, *(int(n) for n in re.findall(r"catalog/page/(\d+)\?model=", html))])
        rows = parse_list(html)
        found += len(rows)
        codes.update(code for code, _ in rows)
        page += 1

    print(f"{make}: {found} products on {pages} pages", file=sys.stderr, flush=True)

for code in sorted(codes):
    print(code)
