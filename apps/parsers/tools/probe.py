"""Closer look at chosen catalogues: forms, script hints and API-like paths.

    .venv/bin/python tools/probe.py <catalogs.json> <id> [<id> ...]
"""

from __future__ import annotations

import json
import re
import sys
import time
from urllib.parse import urljoin, urlsplit

import requests

sys.path.insert(0, ".")
from parsers.http import USER_AGENT  # noqa: E402

HEADERS = {"User-Agent": USER_AGENT, "Accept-Language": "en,uk;q=0.8"}


def probe(entry: dict) -> None:
    url = entry["catalog_url"]
    print(f"\n=== {entry['id']} {entry['name']} | {url}")

    try:
        response = requests.get(url, headers=HEADERS, timeout=25)
    except requests.RequestException as error:
        print("  unreachable:", type(error).__name__)
        return

    body = response.text
    print(f"  {response.status_code} {len(response.content)}B -> {response.url[:110]}")

    for form in re.findall(r"<form[^>]*>.*?</form>", body, flags=re.S | re.I)[:6]:
        head = re.sub(r"\s+", " ", re.match(r"<form[^>]*>", form, flags=re.I).group(0))
        names = sorted(set(re.findall(r'<(?:input|select)[^>]*name="([^"]+)"', form, flags=re.I)))
        visible = [name for name in names if not re.search(r"token|csrf|__|nonce|referer", name, re.I)]

        if visible:
            action = re.search(r'action="([^"]*)"', head)
            method = re.search(r'method="([^"]*)"', head, flags=re.I)
            print(f"  form {method.group(1) if method else 'get'} {urljoin(response.url, action.group(1)) if action else '?'}"[:150], "|", ", ".join(visible)[:120])

    paths = sorted(
        set(
            match
            for match in re.findall(r"[\"'`]((?:https?://[^\"'`\s]{4,80})?/(?:api|rest|ajax|graphql|search|catalog)[^\"'`\s<>]{2,90})[\"'`]", body)
            if not re.search(r"\.(css|js|png|jpg|svg|woff)", match)
        )
    )
    if paths:
        print("  paths:", " ; ".join(paths[:10])[:420])

    scripts = [src for src in re.findall(r'<script[^>]*src="([^"]+)"', body) if not re.search(r"google|gtm|cookie|consent|analytics|jquery|bootstrap", src)]
    hosts = sorted({urlsplit(urljoin(response.url, src)).netloc for src in scripts})
    print("  script hosts:", ", ".join(hosts)[:200], "| app:", ",".join(
        name for name, pattern in {"angular": "ng-version|<app-root", "react": "__NEXT_DATA__|data-reactroot|id=\"root\"", "vue": "id=\"app\"|__NUXT__"}.items() if re.search(pattern, body)
    ) or "-")
    links = sorted(
        {
            urljoin(response.url, href)
            for href in re.findall(r'href="([^"#]+)"', body)
            if re.search(r"catalog|katalog|ecat|product-search|part-finder|partfinder|webcat|tecalliance", href, re.I)
        }
    )
    if links:
        print("  catalogue links:", " ; ".join(links[:6])[:400])


def main() -> None:
    entries = {entry["id"]: entry for entry in json.load(open(sys.argv[1], encoding="utf-8"))}

    for raw in sys.argv[2:]:
        probe(entries[int(raw)])
        time.sleep(1)


if __name__ == "__main__":
    main()
