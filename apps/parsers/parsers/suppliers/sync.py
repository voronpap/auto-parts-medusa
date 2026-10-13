"""Loads a supplier's price list into the store."""

from __future__ import annotations

import logging
from typing import Any

from ..client import CatalogClient, CatalogError
from .base import SupplierAdapter

log = logging.getLogger("parsers")

# What one request to the store may carry.
CHUNK = 500


def sync_supplier(client: CatalogClient, adapter: SupplierAdapter, file_name: str | None = None) -> dict[str, Any]:
    """Reads the whole price list and loads it as one run.

    The supplier is created on first use. A run left open by an interrupted
    load is continued rather than started over: rows are upserts, so sending
    them again is harmless. The run is finished only when the whole list was
    read, so a failure half-way never takes offers off the shelf.
    """
    meta = adapter.supplier
    suppliers = client.suppliers()
    supplier = next((item for item in suppliers if item["name"].casefold() == meta.name.casefold()), None)

    if supplier is None:
        supplier = client.create_supplier(
            {"name": meta.name, "currency_code": meta.currency_code, "lead_days": meta.lead_days}
        )
        log.info("Supplier %s created", meta.name)

    last_run = supplier.get("last_run")
    run = last_run if last_run and last_run.get("status") == "open" else client.open_run(supplier["id"], file_name)
    totals = {"rows": 0, "created": 0, "updated": 0, "unchanged": 0, "skipped": 0, "matched": 0}
    chunk: list[dict[str, Any]] = []

    def flush() -> None:
        if not chunk:
            return

        summary = client.post_rows(run["id"], chunk)

        for key in totals:
            totals[key] += summary.get(key, 0)

        log.info("%s: %d rows loaded", meta.name, totals["rows"])
        chunk.clear()

    for row in adapter.price_list():
        chunk.append(row.to_payload())

        if len(chunk) >= CHUNK:
            flush()

    flush()

    if not totals["rows"]:
        # Nothing was read: leave the shelf as it is and say so.
        raise ValueError(f"The price list of {meta.name} has no rows")

    finished = client.finish_run(run["id"])
    result = {**totals, "delisted": finished.get("offers_delisted", 0), "errors": finished.get("errors")}

    # New prices and stock reach the products right away. The store refuses
    # while no markup is set; the price list is loaded all the same.
    try:
        result["products"] = client.apply_pricing()
    except CatalogError as error:
        log.warning("Prices were not carried over to products: %s", error)
        result["products"] = None

    return result
