"""Photo addresses from the harvest caches, sent to the catalog.

Numbers harvested before adapters reported photos have their addresses in
the response caches already. This reads a cache (read-only, no request to the
source) and imports, per number, only the source and its photos; the shop
copies a photo the first time a shopper opens the product.

    python tools/cache_images.py bosch --dry-run --limit 5
    python tools/cache_images.py ctr --cache D:/.../harvest/cache-ctr.sqlite
    python tools/cache_images.py nissens --limit 100   # the cache is large

Nissens and NRF pages are HTML, so their photo addresses are read by pattern.

CATALOG_URL and CATALOG_API_KEY come from the environment or apps/parsers/.env.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import sys
import time
from pathlib import Path
from typing import Any, Iterator

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from parsers.adapters.bosch import BoschAdapter, _gallery  # noqa: E402
from parsers.adapters.ctr import CtrAdapter, unwrap  # noqa: E402
from parsers.adapters.nissens import NissensAdapter  # noqa: E402
from parsers.adapters.nrf import NrfAdapter  # noqa: E402
from parsers.client import CatalogClient  # noqa: E402
from parsers.models import Image, LookupResult, SourceResult  # noqa: E402
from tools.harvest import read_env  # noqa: E402

# (brand as the catalog knows it, number, photos) per cached response.
Found = tuple[str, str, list[Image]]


def bosch_rows(body: Any) -> Iterator[Found]:
    """A product details response: its number and gallery."""
    if isinstance(body, dict) and body.get("productNumber") and body.get("images"):
        images = _gallery(body, "")
        for image in images:
            image.record_url = None
        if images:
            yield "Bosch", str(body["productNumber"]), images


def ctr_rows(body: Any) -> Iterator[Found]:
    """A search response: every hit with a photo, by its CTR number."""
    try:
        rows = unwrap(body).get("list")
    except Exception:
        return
    for row in rows if isinstance(rows, list) else []:
        photo = row.get("image") if isinstance(row, dict) else None
        if row.get("ctrNo") and isinstance(photo, str) and photo.startswith("https://"):
            yield "CTR", str(row["ctrNo"]), [Image(url=photo, kind="photo")]


MAX_PER_NUMBER = 4
NISSENS_PHOTO = re.compile(
    r"https://customerportal\.nissens\.com/ImageBank360Degree/([0-9A-Za-z]+)/NIS-\1-(\d+)\.jpg"
)
# NRF shows its own watermark on the photos; it stays as it is.
NRF_PHOTO = re.compile(
    r"https://webshop\.nrf\.eu/media/catalog/product/\w/\w/(\d+)_1500x1000_WM_(\d+)(?:_\d+)?\.jpg"
)


def by_pattern(brand: str, pattern: re.Pattern[str], spread: bool):
    def read(body: Any) -> Iterator[Found]:
        if not isinstance(body, str):
            return
        frames: dict[str, dict[int, str]] = {}
        for match in pattern.finditer(body):
            frames.setdefault(match.group(1), {}).setdefault(int(match.group(2)), match.group(0))
        for number, shots in frames.items():
            order = [shots[key] for key in sorted(shots)]
            if spread and len(order) > MAX_PER_NUMBER:
                # A 360-degree set: a few evenly spaced turns, not neighbours.
                step = len(order) / MAX_PER_NUMBER
                order = [order[int(i * step)] for i in range(MAX_PER_NUMBER)]
            yield brand, number, [Image(url=url, kind="photo") for url in order[:MAX_PER_NUMBER]]

    return read


SOURCES = {
    "bosch": (BoschAdapter, bosch_rows),
    "ctr": (CtrAdapter, ctr_rows),
    "nissens": (NissensAdapter, by_pattern("Nissens", NISSENS_PHOTO, spread=True)),
    "nrf": (NrfAdapter, by_pattern("NRF", NRF_PHOTO, spread=False)),
}


def collect(cache: Path, read, scan: int = 0) -> dict[tuple[str, str], list[Image]]:
    found: dict[tuple[str, str], list[Image]] = {}
    db = sqlite3.connect(f"file:{cache.as_posix()}?mode=ro", uri=True)
    query = "select body from responses where status = 200"

    for (body,) in db.execute(query + (f" limit {int(scan)}" if scan else "")):
        try:
            data = json.loads(body)
        except (TypeError, ValueError):
            # HTML pages are read as text.
            data = body
        for brand, number, images in read(data):
            known = found.setdefault((brand, number), [])
            urls = {image.url for image in known}
            known.extend(image for image in images if image.url not in urls)
            del known[MAX_PER_NUMBER if brand in {"Nissens", "NRF"} else 6 :]

    return found


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("source", choices=sorted(SOURCES))
    parser.add_argument("--cache", type=Path, help="default: harvest/cache-<source>.sqlite")
    parser.add_argument("--limit", type=int, default=0, help="numbers to send, 0 = all")
    parser.add_argument("--interval", type=float, default=0.5, help="seconds between imports")
    parser.add_argument("--scan", type=int, default=0, help="cached responses to read, 0 = all")
    parser.add_argument("--dry-run", action="store_true", help="print what would be sent")
    args = parser.parse_args()

    adapter_class, read = SOURCES[args.source]
    cache = args.cache or ROOT / "harvest" / f"cache-{args.source}.sqlite"
    found = collect(cache, read, args.scan)
    items = list(found.items())[: args.limit or None]
    print(f"{len(found)} numbers with photos in {cache.name}; sending {len(items)}", file=sys.stderr)

    adapter = adapter_class(None)  # type: ignore[arg-type]
    client = None

    if not args.dry_run:
        env = {**read_env(ROOT / ".env"), **os.environ}
        if not env.get("CATALOG_URL") or not env.get("CATALOG_API_KEY"):
            print("CATALOG_URL and CATALOG_API_KEY must be set", file=sys.stderr)
            return 2
        client = CatalogClient(env["CATALOG_URL"], env["CATALOG_API_KEY"])

    for (brand, number), images in items:
        result = LookupResult(worker="cache-images")
        result.add(adapter.source, f"{args.source}-cache-images", adapter.version, SourceResult(images=images))
        payload = {
            "worker": "cache-images",
            "number": {"brand": brand, "number_type": "aftermarket", "number": number},
            "result": result.to_payload(),
        }

        if client is None:
            print(json.dumps(payload["number"] | {"images": [image.url for image in images]}, ensure_ascii=False))
            continue

        summary = client.import_result(payload)
        print(f"{brand} {number}: {summary}", file=sys.stderr)
        time.sleep(args.interval)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
