"""Loads a parsed PDF catalogue into the store's catalog, one part number per
request, so the PDF is read once and never during a lookup."""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Any

from ..client import CatalogClient, CatalogError
from . import kyb, monroe

log = logging.getLogger("parsers")

# The catalog accepts at most this many fitment rows in one result.
MAX_APPLICATIONS = 1000

MONROE_SOURCE = {
    "key": "monroe-pdf",
    # Must match the name in the catalog's source registry.
    "name": "Monroe (каталог виробника)",
    "kind": "manufacturer_catalog",
    "license_class": "OPEN",
    "lineage": "monroe",
    "url": monroe.PDF_URL,
    "catalog_version": monroe.CATALOG_VERSION,
    "parser": {"name": "monroe-pdf", "version": monroe.PARSER_VERSION},
}


KYB_SOURCE = {
    "key": "kyb-pdf",
    "name": "KYB (каталог виробника)",
    "kind": "manufacturer_catalog",
    "license_class": "OPEN",
    "lineage": "kyb",
    "url": kyb.PDF_URL,
    "catalog_version": kyb.CATALOG_VERSION,
    "parser": {"name": "kyb-pdf", "version": kyb.PARSER_VERSION},
}

# Catalogues that can be loaded: brand of the part numbers and their source.
CATALOGUES = {
    "monroe": ("Monroe", MONROE_SOURCE),
    "kyb": ("KYB", KYB_SOURCE),
}


def _post_paced(client: CatalogClient, payload: dict[str, Any]) -> dict[str, Any]:
    for attempt in range(4):
        try:
            return client.import_result(payload)
        except CatalogError as error:
            if "HTTP 429" not in str(error) or attempt == 3:
                raise

            time.sleep(65)

    raise CatalogError("unreachable")


def load_catalogue(
    name: str,
    client: CatalogClient,
    index_path: Path,
    worker: str,
    limit: int | None = None,
    pause: float = 0.6,
) -> dict[str, int]:
    """Imports every part number of a parsed catalogue.

    Progress is kept beside the index, so an interrupted run resumes where it
    stopped; the catalog also ignores rows it already has. Requests are paced
    to stay under the store's own limit on admin writes, and a refusal for
    being too fast is waited out rather than counted as a failure.
    """
    brand, source = CATALOGUES[name]
    index = json.loads(index_path.read_text(encoding="utf-8"))
    done_path = index_path.with_suffix(".imported.json")
    done: set[str] = set(json.loads(done_path.read_text(encoding="utf-8"))) if done_path.exists() else set()
    retrieved_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(index_path.stat().st_mtime))
    totals = {"parts": 0, "applications": 0, "failed": 0}
    pending = [number for number in index["parts"] if number not in done]

    for number in pending[:limit] if limit else pending:
        rows = [
            {"source": source["key"], **{k: v for k, v in row.items() if k != "page"}}
            for row in index["parts"][number]
        ]

        try:
            for start in range(0, len(rows), MAX_APPLICATIONS):
                summary = _post_paced(
                    client,
                    {
                        "worker": worker,
                        "number": {"brand": brand, "number_type": "aftermarket", "number": number},
                        "result": {
                            "worker": worker,
                            "sources": [{**source, "retrieved_at": retrieved_at}],
                            "relationships": [],
                            "applications": rows[start : start + MAX_APPLICATIONS],
                            "attributes": [],
                            "errors": [],
                        },
                    },
                ).get("summary", {})
                totals["applications"] += summary.get("applications_added", 0)
        except CatalogError as error:
            totals["failed"] += 1
            log.error("%s %s was not imported: %s", brand, number, error)
            continue

        totals["parts"] += 1
        done.add(number)

        if totals["parts"] % 25 == 0:
            done_path.write_text(json.dumps(sorted(done)), encoding="utf-8")
            log.info("%s import: %d parts, %d fitment rows", brand, totals["parts"], totals["applications"])

        if pause:
            time.sleep(pause)

    done_path.write_text(json.dumps(sorted(done)), encoding="utf-8")

    return totals
