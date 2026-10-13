"""Runs adapters for a number and exchanges tasks with the catalog."""

from __future__ import annotations

import json
import logging
import time
from concurrent.futures import ThreadPoolExecutor, wait
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
        # Everything the adapter reads is kept, whatever comes of the lookup.
        recorded: list[dict[str, Any]] = []
        http = getattr(adapter, "http", None)

        if http is not None:
            http.recorder = recorded

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

        else:
            result.add(adapter.source, adapter.name, adapter.version, found)
        finally:
            if http is not None:
                http.recorder = None

            result.documents += [
                {
                    **document,
                    "source_key": adapter.source.key,
                    "source_name": adapter.source.name,
                    "parser_name": adapter.name,
                    "parser_version": adapter.version,
                }
                for document in recorded
            ]

    if not covered:
        # Reported as an error so the catalog marks the task failed and it can
        # be run again once an adapter for this brand exists.
        result.add_error("parsers", f"No adapter covers brand {request.brand!r} yet")

    if schema is not None:
        # Never send what the catalog would refuse; fail loudly here instead.
        jsonschema.validate(result.to_payload(), schema)

    return result


def archive_documents(client: CatalogClient, request: LookupRequest, documents: list[dict[str, Any]]) -> int:
    """Sends raw responses to the catalog's archive. A failure here is logged
    and never loses the result that was read from them."""
    if not documents:
        return 0

    try:
        return client.archive(
            {"brand": request.brand, "number_type": request.number_type, "number": request.number},
            documents,
        )
    except CatalogError as error:
        log.error("Responses for %s %s were not archived: %s", request.brand, request.number, error)

        return 0


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

        documents: list[dict[str, Any]] = []

        try:
            result = run_lookup(adapters, request, worker, schema)
            documents = result.documents
            payload = result.to_payload()
        except jsonschema.ValidationError as error:
            log.error("Result for task %s does not match the schema: %s", task["id"], error.message)
            payload = LookupResult(worker=worker).to_payload()
            payload["errors"] = [
                {"source": None, "message": f"invalid result: {error.message}"[:2000]}
            ]

        summary = client.post_result(task["id"], payload).get("summary", {})
        archive_documents(client, request, documents)
        log.info(
            "%s %s: %s relationships, %s applications, %s errors",
            request.brand,
            request.number,
            summary.get("relationships_added", 0) + summary.get("relationships_confirmed", 0),
            summary.get("applications_added", 0),
            summary.get("errors", 0),
        )

    return len(tasks)


def identify_number(adapters: Iterable[Adapter], number: str, worker: str) -> dict[str, Any]:
    """Asks every source whose part a bare number is; one failing does not
    stop the rest."""
    candidates: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []

    for adapter in adapters:
        try:
            found = adapter.identify(number)
        except SourceError as error:
            log.warning("%s could not identify %s: %s", adapter.name, number, error)
            errors.append({"source": adapter.name, "message": str(error)[:2000]})
            continue
        except Exception as error:  # an adapter bug must not lose the other sources
            log.exception("%s crashed identifying %s", adapter.name, number)
            errors.append({"source": adapter.name, "message": f"adapter error: {type(error).__name__}: {error}"[:2000]})
            continue

        candidates += [
            {
                "brand": str(item["brand"])[:200],
                "number": str(item["number"])[:100],
                "title": (item.get("title") or None) and str(item["title"])[:300],
                "source": adapter.name,
            }
            for item in found
            if item.get("brand") and item.get("number")
        ]

    if not candidates:
        candidates = identify_by_lookup(adapters, number)

    return {"worker": worker, "candidates": candidates[:100], "errors": errors[:50]}


# Attributes in which catalogues give the name of the part.
TITLE_ATTRIBUTES = ("назва", "найменування", "тип деталі", "product", "name", "description", "опис")
# A person is waiting: catalogues are asked only this long.
IDENTIFY_BUDGET_SECONDS = 40.0


def identify_by_lookup(adapters: Iterable[Adapter], number: str) -> list[dict[str, Any]]:
    """When no source can be searched by a bare number, each manufacturer's
    catalogue is asked whether the number is its own part. A catalogue that
    returns anything for it knows the part. What it returned stays in the
    cache, so the lookup that follows does not ask again.

    The catalogues are different sites, so they are asked side by side; the
    pause between requests to one site is kept by the shared rate limiter."""

    def ask(adapter: Adapter) -> dict[str, Any] | None:
        brand = adapter.brands[0]

        try:
            result = adapter.lookup(LookupRequest(brand, number, "aftermarket"))
        except Exception as error:  # a source that fails simply does not answer
            log.info("%s did not answer for %s: %s", adapter.name, number, error)
            return None

        if result.is_empty:
            return None

        title = next(
            (
                attribute.value
                for wanted in TITLE_ATTRIBUTES
                for attribute in result.attributes
                if attribute.name.lower().startswith(wanted)
            ),
            None,
        )

        return {"brand": brand, "number": number.strip()[:100], "title": title and title[:300], "source": adapter.name}

    makers = [adapter for adapter in adapters if adapter.brands]

    if not makers:
        return []

    pool = ThreadPoolExecutor(max_workers=len(makers), thread_name_prefix="identify")
    asked = [pool.submit(ask, adapter) for adapter in makers]
    done, late = wait(asked, timeout=IDENTIFY_BUDGET_SECONDS)
    # Catalogues still answering are left to finish into the cache.
    pool.shutdown(wait=False)

    if late:
        log.warning("Identification of %s: %d catalogues did not answer in time", number, len(late))

    # In the order the adapters are registered.
    return [found for future in asked if future in done and (found := future.result())]


def identify_forever(
    client: CatalogClient,
    adapters: list[Adapter],
    worker: str,
    idle_seconds: float = 2.0,
) -> None:
    """Answers number searches as they are typed. Runs beside the lookup
    worker, so a person is never kept waiting behind a long lookup."""
    log.info("Identifier %s started with %d adapters", worker, len(adapters))

    while True:
        try:
            searches = client.pending_searches()

            for search in searches:
                payload = identify_number(adapters, search["number"], worker)
                client.post_search_result(search["id"], payload)
                log.info("%s: %d candidates, %d errors", search["number"], len(payload["candidates"]), len(payload["errors"]))
        except CatalogError as error:
            log.error("Catalog unavailable: %s", error)
            searches = []
            time.sleep(15)

        if not searches:
            time.sleep(idle_seconds)


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
