"""Runs adapters for a number and exchanges tasks with the catalog."""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Any, Iterable

import jsonschema

from .adapters import Adapter, LookupRequest
from .client import CatalogClient, CatalogError
from .http import SourceError
from .models import LookupResult

log = logging.getLogger("parsers")

# The schema the catalog generates from its own request validation.
DEFAULT_SCHEMA = Path(__file__).resolve().parents[3] / "docs" / "lookup-result.schema.json"


def load_schema(path: Path = DEFAULT_SCHEMA) -> dict[str, Any] | None:
    if not path.exists():
        return None

    return json.loads(path.read_text(encoding="utf-8"))


def run_lookup(
    adapters: Iterable[Adapter],
    request: LookupRequest,
    worker: str,
    schema: dict[str, Any] | None = None,
) -> LookupResult:
    """Asks every adapter that covers the brand, and every source that can be
    searched for another maker's number; one failing does not stop the rest."""
    result = LookupResult(worker=worker)
    covered = False

    for adapter in adapters:
        own = adapter.supports(request)

        if not own and not adapter.cross_search:
            continue

        covered = covered or own

        try:
            found = adapter.lookup(request) if own else adapter.lookup_foreign(request)
        except SourceError as error:
            log.warning("%s failed for %s %s: %s", adapter.name, request.brand, request.number, error)
            result.add_error(adapter.name, str(error))
            continue
        except Exception as error:  # an adapter bug must not lose the other sources
            log.exception("%s crashed for %s %s", adapter.name, request.brand, request.number)
            result.add_error(adapter.name, f"adapter error: {type(error).__name__}: {error}")
            continue

        result.add(adapter.source, adapter.name, adapter.version, found)

    if not covered:
        # Reported as an error so the catalog marks the task failed and it can
        # be run again once an adapter for this brand exists.
        result.add_error("parsers", f"No adapter covers brand {request.brand!r} yet")

    if schema is not None:
        # Never send what the catalog would refuse; fail loudly here instead.
        jsonschema.validate(result.to_payload(), schema)

    return result


def process_tasks(
    client: CatalogClient,
    adapters: list[Adapter],
    worker: str,
    limit: int = 5,
    schema: dict[str, Any] | None = None,
) -> int:
    """Claims tasks, looks each number up and posts the result. Returns the count."""
    tasks = client.claim(worker, limit)

    for task in tasks:
        request = LookupRequest(
            brand=task["brand"], number=task["number"], number_type=task["number_type"]
        )

        try:
            result = run_lookup(adapters, request, worker, schema)
            payload = result.to_payload()
        except jsonschema.ValidationError as error:
            log.error("Result for task %s does not match the schema: %s", task["id"], error.message)
            payload = LookupResult(worker=worker).to_payload()
            payload["errors"] = [
                {"source": None, "message": f"invalid result: {error.message}"[:2000]}
            ]

        summary = client.post_result(task["id"], payload).get("summary", {})
        log.info(
            "%s %s: %s relationships, %s applications, %s errors",
            request.brand,
            request.number,
            summary.get("relationships_added", 0) + summary.get("relationships_confirmed", 0),
            summary.get("applications_added", 0),
            summary.get("errors", 0),
        )

    return len(tasks)


def run_forever(
    client: CatalogClient,
    adapters: list[Adapter],
    worker: str,
    idle_seconds: float = 30.0,
    schema: dict[str, Any] | None = None,
) -> None:
    log.info("Worker %s started with %d adapters", worker, len(adapters))

    while True:
        try:
            handled = process_tasks(client, adapters, worker, schema=schema)
        except CatalogError as error:
            log.error("Catalog unavailable: %s", error)
            handled = 0

        if not handled:
            time.sleep(idle_seconds)
