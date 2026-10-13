"""First look at parts shops: does the site answer a polite robot, what does
its robots.txt say, and does a search for a known number return the part.

    .venv/bin/python tools/shops_probe.py
"""
from __future__ import annotations

import re
import sys
import time
from urllib.parse import urljoin

import requests

sys.path.insert(0, ".")
from parsers.http import USER_AGENT  # noqa: E402

HEADERS = {"User-Agent": USER_AGENT, "Accept-Language": "uk,en;q=0.8"}
NUMBER = "0451103314"  # Bosch oil filter; OE 06A 115 561 B
BLOCK = ("captcha", "cf-challenge", "just a moment", "access denied", "доступ заблок", "are you a robot", "ddos-guard")

# Site -> search address patterns to try with the number.
SHOPS = {
    "dok.ua": ["https://dok.ua/ua/result2/query?q={n}", "https://dok.ua/ua/search?q={n}"],
    "autoklad.ua": ["https://www.autoklad.ua/search/?q={n}", "https://www.autoklad.ua/ua/search/?q={n}"],
    "ukrparts.com.ua": ["https://ukrparts.com.ua/search/?q={n}", "https://ukrparts.com.ua/ua/search/?search={n}"],
    "avto.pro": ["https://avto.pro/search/?q={n}", "https://avto.pro/part-{n}/"],
    "atl.ua": ["https://atl.ua/search?q={n}", "https://atl.ua/ua/search?q={n}"],
    "busmarket.ua": ["https://busmarket.ua/search/?q={n}", "https://busmarket.ua/ua/search/?q={n}"],
    "130.com.ua": ["https://130.com.ua/search?q={n}", "https://130.com.ua/uk/search?search={n}"],
    "autodoc.ua": ["https://autodoc.ua/search?keyword={n}"],
    "zapchasti.ria.com": ["https://zapchasti.ria.com/uk/search/?q={n}"],
    "kolesa-darom / avtozapchasti.ua": ["https://avtozapchasti.ua/search/?q={n}"],
    "motorka / pitstop.ua": ["https://pitstop.ua/search?q={n}"],
    "spareto.com": ["https://spareto.com/search?q={n}"],
    "trodo.com": ["https://www.trodo.com/catalogsearch/result/?q={n}"],
    "autodoc.co.uk": ["https://www.autodoc.co.uk/search?keyword={n}"],
    "onlinecarparts.co.uk": ["https://www.onlinecarparts.co.uk/spares-search.html?keyword={n}"],
    "oscaro.com": ["https://www.oscaro.com/fr/search?q={n}"],
    "winparts.co.uk": ["https://www.winparts.co.uk/search?q={n}"],
    "motointegrator.com": ["https://www.motointegrator.com/search?q={n}"],
    "iparto / intercars.com.ua": ["https://intercars.com.ua/ua/search/?q={n}"],
    "autoteile-teufel.de": ["https://www.autoteile-teufel.de/search?q={n}"],
    "partsouq.com": ["https://partsouq.com/en/search/all?q={n}"],
    "7zap.com": ["https://7zap.com/en/search/?keyword={n}"],
    "emex.ua": ["https://emex.ua/search?q={n}"],
    "avtoplus / autoplus.ua": ["https://autoplus.ua/search/?q={n}"],
    "masuma / vivat.ua": ["https://vivat.ua/search/?q={n}"],
}


def get(url: str):
    try:
        return requests.get(url, headers=HEADERS, timeout=25, allow_redirects=True)
    except requests.RequestException as error:
        return type(error).__name__


for name, patterns in SHOPS.items():
    host = re.match(r"https?://[^/]+", patterns[0]).group(0)
    robots = get(f"{host}/robots.txt")
    rules = ""

    if not isinstance(robots, str) and robots.status_code == 200:
        general = re.split(r"(?im)^user-agent:\s*\*\s*$", robots.text)
        block = general[1].split("User-agent")[0] if len(general) > 1 else ""
        disallows = re.findall(r"(?im)^disallow:\s*(\S*)", block)
        rules = "ALL CLOSED" if "/" in disallows else f"{len(disallows)} disallow" + (
            " (search closed)" if any("search" in d.lower() for d in disallows) else ""
        )

    time.sleep(2)
    best = None

    for pattern in patterns:
        response = get(pattern.format(n=NUMBER))

        if isinstance(response, str):
            best = best or f"unreachable ({response})"
            continue

        body = response.text
        blocked = response.status_code in (401, 403, 429, 503) or any(m in body[:6000].lower() for m in BLOCK)
        hits = len(re.findall(r"0\s?451\s?103\s?314", body))
        oe = len(re.findall(r"06A\s?115\s?561", body))
        summary = f"{response.status_code} {len(body)//1024}KB" + (" BLOCKED" if blocked else "") + f" number×{hits} oe×{oe} -> {response.url[:70]}"

        if not blocked and hits:
            best = summary
            break

        best = best if best and "number×" in best and "BLOCKED" not in best else summary
        time.sleep(2)

    print(f"{name:32} robots: {rules or 'none/unknown':28} | {best}", flush=True)
