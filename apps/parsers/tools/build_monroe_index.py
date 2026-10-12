"""Parses the Monroe PDF once and stores the result as JSON for loading."""
import dataclasses
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, ".")
from parsers.pdf import monroe  # noqa: E402

pdf = Path(sys.argv[1])
target = Path(sys.argv[2])
started = time.time()


def progress(page, parts):
    if page % 25 == 0:
        print(f"page {page} read, {time.time() - started:.0f}s", flush=True)


fitments = monroe.build(pdf, progress, lines_cache=target.with_suffix('.lines.json'))
target.parent.mkdir(parents=True, exist_ok=True)
json.dump(
    {
        "parser_version": monroe.PARSER_VERSION,
        "catalog_version": monroe.CATALOG_VERSION,
        "parts": {
            number: [
                {"page": item.page, **{k: v for k, v in dataclasses.asdict(item.application).items() if v is not None}}
                for item in items
            ]
            for number, items in sorted(fitments.items())
        },
    },
    open(target, "w", encoding="utf-8"),
    ensure_ascii=False,
)
total = sum(len(items) for items in fitments.values())
print(f"done: {len(fitments)} part numbers, {total} fitments, {time.time() - started:.0f}s", flush=True)
