"""Photo addresses from the harvest caches, sent to the catalog.

Numbers harvested before adapters reported photos have their addresses in
the response caches already. This reads a cache (read-only, no request to the
source) and imports, per number, only the source and its photos; the shop
copies a photo the first time a shopper opens the product.

    python tools/cache_images.py bosch --dry-run --limit 5
    python tools/cache_images.py ctr --cache D:/.../harvest/cache-ctr.sqlite

CATALOG_URL and CATALOG_API_KEY come from the environment or apps/parsers/.env.
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
import time
from pathlib import Path
from typing import Any, Iterator

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from parsers.adapters.bosch import BoschAdapter, _gallery  # noqa: E402
from parsers.adapters.ctr import CtrAdapter, unwrap  # noqa: E402
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


SOURCES = {
    "bosch": (BoschAdapter, bosch_rows),
    "ctr": (CtrAdapter, ctr_rows),
}


def collect(cache: Path, read) -> dict[tuple[str, str], list[Image]]:
    found: dict[tuple[str, str], list[Image]] = {}
    db = sqlite3.connect(f"file:{cache.as_posix()}?mode=ro", uri=True)

    for (body,) in db.execute("select body from responses where status = 200"):
        try:
            data = json.loads(body)
        except (TypeError, ValueError):
            continue
        for brand, number, images in read(data):
            known = found.setdefault((brand, number), [])
            urls = {image.url for image in known}
            known.extend(image for image in images if image.url not in urls)

    return found


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("source", choices=sorted(SOURCES))
    parser.add_argument("--cache", type=Path, help="default: harvest/cache-<source>.sqlite")
    parser.add_argument("--limit", type=int, default=0, help="numbers to send, 0 = all")
    parser.add_argument("--interval", type=float, default=0.5, help="seconds between imports")
    parser.add_argument("--dry-run", action="store_true", help="print what would be sent")
    args = parser.parse_args()

    adapter_class, read = SOURCES[args.source]
    cache = args.cache or ROOT / "harvest" / f"cache-{args.source}.sqlite"
    found = collect(cache, read)
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
