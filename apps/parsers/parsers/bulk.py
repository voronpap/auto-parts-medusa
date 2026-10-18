"""Looks a list of part numbers up and loads the results into the catalog.

For numbers that are known in advance (a price list, the products a
catalogue gives for some vehicles) rather than queued by the store.
"""

from __future__ import annotations

import json
import os
import logging
import time
from pathlib import Path
from typing import Any

import jsonschema

from .adapters import Adapter, LookupRequest
from .client import CatalogClient, CatalogError
from .worker import archive_documents, run_lookup

log = logging.getLogger("parsers")

# What the catalog accepts in one result.
MAX_RELATIONSHIPS = 500
MAX_APPLICATIONS = 5000


def _post_paced(client: CatalogClient, payload: dict[str, Any]) -> dict[str, Any]:
    for attempt in range(4):
        try:
            return client.import_result(payload)
        except CatalogError as error:
            # The store limits admin writes per minute; wait the window out.
            if "HTTP 429" not in str(error) or attempt == 3:
                raise

            time.sleep(65)

    raise CatalogError("unreachable")


def import_numbers(
    client: CatalogClient,
    adapters: list[Adapter],
    brand: str,
    numbers: list[str],
    worker: str,
    number_type: str = "aftermarket",
    schema: dict[str, Any] | None = None,
    progress_path: Path | None = None,
    pause: float = 0.6,
) -> dict[str, int]:
    """Looks every number up and imports what the sources say about it.

    Progress is kept in a file, so an interrupted run resumes where it
    stopped. A number no source knows is counted and skipped.
    """
    done: set[str] = (
        set(json.loads(progress_path.read_text(encoding="utf-8")))
        if progress_path and progress_path.exists()
        else set()
    )
    totals = {"numbers": 0, "unknown": 0, "relationships": 0, "applications": 0, "failed": 0}
    # A shop that does not carry a brand answers "nothing" for every number;
    # after this many such answers in a row and none found, the brand is left.
    give_up = int(os.environ.get("PARSERS_GIVE_UP_AFTER") or 0)

    for number in numbers:
        if number in done:
            continue

        if give_up and not totals["numbers"] and totals["unknown"] >= give_up:
            log.info("%s: none of the first %d numbers is known here; the rest is skipped", brand, give_up)
            totals["skipped"] = len([n for n in numbers if n not in done])
            break

        request = LookupRequest(brand, number, number_type)

        try:
            looked_up = run_lookup(adapters, request, worker, schema)
        except jsonschema.ValidationError as error:
            # One number the catalog would refuse must not stop the list.
            totals["failed"] += 1
            log.error("%s %s: result does not match the schema: %s", brand, number, error.message[:200])
            continue
        result = looked_up.to_payload()
        relationships = result["relationships"]
        applications = result["applications"]

        if not (relationships or applications or result["attributes"] or result["images"]):
            totals["unknown"] += 1
            log.info("%s %s: nothing found", brand, number)
        else:
            # A long result goes in parts of what one request may carry.
            parts = max(
                1,
                -(-len(relationships) // MAX_RELATIONSHIPS),
                -(-len(applications) // MAX_APPLICATIONS),
            )

            try:
                for index in range(parts):
                    summary = _post_paced(
                        client,
                        {
                            "worker": worker,
                            "number": {"brand": brand, "number_type": number_type, "number": number},
                            "result": {
                                **result,
                                "relationships": relationships[
                                    index * MAX_RELATIONSHIPS : (index + 1) * MAX_RELATIONSHIPS
                                ],
                                "applications": applications[
                                    index * MAX_APPLICATIONS : (index + 1) * MAX_APPLICATIONS
                                ],
                                "attributes": result["attributes"] if index == 0 else [],
                                "errors": [],
                            },
                        },
                    ).get("summary", {})
                    totals["relationships"] += summary.get("relationships_added", 0) + summary.get(
                        "relationships_confirmed", 0
                    )
                    totals["applications"] += summary.get("applications_added", 0)
            except CatalogError as error:
                totals["failed"] += 1
                log.error("%s %s was not imported: %s", brand, number, error)
                continue

            totals["numbers"] += 1
            log.info(
                "%s %s: %d crosses, %d fitment rows found", brand, number, len(relationships), len(applications)
            )

        # After the import, so the responses are filed under the new number.
        archive_documents(client, request, looked_up.documents)
        done.add(number)

        if progress_path:
            progress_path.write_text(json.dumps(sorted(done)), encoding="utf-8")

        if pause:
            time.sleep(pause)

    return totals
