"""Parses a PDF catalogue once and stores the result as JSON for loading.

    .venv/bin/python tools/build_pdf_index.py monroe <catalogue.pdf>
"""
import dataclasses
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, ".")
from parsers.pdf import kyb, monroe  # noqa: E402

PARSERS = {"monroe": monroe, "kyb": kyb}
name, pdf = sys.argv[1], Path(sys.argv[2])
parser = PARSERS[name]
target = Path(f".cache/index/{name}.json")
started = time.time()


def progress(page, _):
    if page % 50 == 0:
        print(f"page {page} read, {time.time() - started:.0f}s", flush=True)


fitments = parser.build(pdf, progress, lines_cache=target.with_suffix(".lines.json"))
target.parent.mkdir(parents=True, exist_ok=True)
json.dump(
    {
        "parser_version": parser.PARSER_VERSION,
        "catalog_version": parser.CATALOG_VERSION,
        "parts": {
            number: [
                {
                    "page": item.page,
                    **{key: value for key, value in dataclasses.asdict(item.application).items() if value is not None},
                }
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
