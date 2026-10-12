"""One polite request to each catalog's entry page, to sort the sources by
how they can be read: plain pages, script-driven apps, blocked, or files.

    .venv/bin/python tools/triage.py <catalogs.json> <report.json>
"""

from __future__ import annotations

import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlsplit

import requests

sys.path.insert(0, ".")
from parsers.http import USER_AGENT  # noqa: E402

SEARCH_FIELD = re.compile(
    r'<input[^>]*name="([^"]*(?:search|query|article|artikel|sku|oe|oem|number|nummer|ref|keyword|q)[^"]*)"',
    re.I,
)
APP_HINTS = {
    "angular": r"ng-version|ng-app|<app-root",
    "react": r'data-reactroot|id="root"|__NEXT_DATA__',
    "vue": r'id="app"|data-v-|__NUXT__',
    "blazor": r"_framework/blazor",
}


def classify(entry: dict) -> dict:
    url = entry["catalog_url"]
    row = {
        "id": entry["id"],
        "name": entry["name"],
        "url": url,
        "access": entry["access"],
        "platform": entry.get("platform"),
    }

    if "tecalliance" in url:
        return {**row, "verdict": "tecalliance", "detail": "TecDoc web service behind an API key"}

    if url.lower().endswith(".pdf") or entry["access"].startswith("PDF"):
        row["kind_hint"] = "pdf"

    try:
        response = requests.get(
            url,
            headers={"User-Agent": USER_AGENT, "Accept-Language": "en,uk;q=0.8"},
            timeout=25,
            allow_redirects=True,
        )
    except requests.RequestException as error:
        return {**row, "verdict": "unreachable", "detail": type(error).__name__}

    body = response.text[:400_000]
    lower = body.lower()
    final_host = urlsplit(response.url).netloc
    row.update(status=response.status_code, final_host=final_host, size=len(response.content))

    if "tecalliance" in final_host or "web.tecalliance.net" in lower:
        return {**row, "verdict": "tecalliance", "detail": "redirects to or embeds TecAlliance"}

    if response.status_code in (401, 403, 429) or any(
        marker in lower[:6000]
        for marker in ("just a moment", "cf-challenge", "captcha", "access denied")
    ):
        return {**row, "verdict": "blocked", "detail": f"HTTP {response.status_code}"}

    if response.status_code >= 400:
        return {**row, "verdict": "error", "detail": f"HTTP {response.status_code}"}

    content_type = response.headers.get("content-type", "")

    if "pdf" in content_type:
        return {**row, "verdict": "pdf", "detail": "direct PDF"}

    fields = sorted(set(SEARCH_FIELD.findall(body)))[:6]
    hints = [name for name, pattern in APP_HINTS.items() if re.search(pattern, body, re.I)]
    text_length = len(re.sub(r"<script.*?</script>|<style.*?</style>|<[^>]+>", " ", body, flags=re.S | re.I).split())
    pdf_links = len(re.findall(r'href="[^"]+\.pdf', body, re.I))
    row.update(search_fields=fields, app=hints, words=text_length, pdf_links=pdf_links)

    if row.get("kind_hint") == "pdf" or (pdf_links >= 3 and not fields):
        return {**row, "verdict": "pdf", "detail": f"{pdf_links} PDF links"}

    if fields and text_length > 150:
        return {**row, "verdict": "html-form", "detail": ", ".join(fields)}

    if hints or text_length < 150:
        return {**row, "verdict": "script-app", "detail": ", ".join(hints) or "little server-rendered text"}

    return {**row, "verdict": "html", "detail": "server-rendered, no search field on the entry page"}


def main(source: str, target: str) -> None:
    entries = json.load(open(source, encoding="utf-8"))

    # Every catalog is a different host, so parallel requests still mean one
    # request per site.
    with ThreadPoolExecutor(max_workers=8) as pool:
        rows = list(pool.map(classify, entries))

    json.dump(rows, open(target, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    counts: dict[str, int] = {}

    for row in rows:
        counts[row["verdict"]] = counts.get(row["verdict"], 0) + 1

    print(json.dumps(counts, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
