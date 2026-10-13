"""Client for the catalog's lookup-task API."""

from __future__ import annotations

import logging
import time
from typing import Any

log = logging.getLogger("parsers")

# What one archive request may carry: the route accepts 8 MB.
ARCHIVE_BATCH_BYTES = 3_500_000
ARCHIVE_BATCH_DOCUMENTS = 20
ARCHIVE_MAX_BODY = 5_500_000

import requests


class CatalogError(Exception):
    """The catalog rejected a request or could not be reached."""


class CatalogClient:
    def __init__(
        self,
        base_url: str,
        api_key: str,
        timeout: float = 60.0,
        session: requests.Session | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout
        self._session = session or requests.Session()
        # A Medusa secret API key is the Basic-auth user name with no password.
        self._session.auth = (api_key, "")

    def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        try:
            response = self._session.post(
                f"{self._base_url}{path}", json=payload, timeout=self._timeout
            )
        except requests.RequestException as error:
            raise CatalogError(f"{type(error).__name__}: {error}") from error

        if response.status_code >= 400:
            raise CatalogError(f"HTTP {response.status_code}: {response.text[:500]}")

        return response.json()

    def claim(self, worker: str, limit: int = 5) -> list[dict[str, Any]]:
        return self._post(
            "/admin/parts-catalog/lookup-tasks/claim",
            {"worker": worker, "limit": limit},
        )["tasks"]

    def post_result(self, task_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        return self._post(
            f"/admin/parts-catalog/lookup-tasks/{task_id}/result", payload
        )

    def import_result(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Loads bulk-read data for one part number, bypassing the queue."""
        return self._post("/admin/parts-catalog/import", payload)

    def archive(self, number: dict[str, Any] | None, documents: list[dict[str, Any]]) -> int:
        """Stores raw source responses in the catalog; returns how many were sent."""
        batch: list[dict[str, Any]] = []
        size = 0
        sent = 0

        def flush() -> None:
            nonlocal batch, size, sent

            if not batch:
                return

            for attempt in range(4):
                try:
                    self._post("/admin/parts-catalog/documents", {"number": number, "documents": batch})
                    break
                except CatalogError as error:
                    # The store limits admin writes per minute; wait the window out.
                    if "HTTP 429" not in str(error) or attempt == 3:
                        raise

                    time.sleep(65)

            sent += len(batch)
            batch, size = [], 0

        for document in documents:
            body_size = len(document["body"].encode("utf-8"))

            if body_size > ARCHIVE_MAX_BODY:
                log.warning("Response of %s is too large to archive (%d bytes)", document["url"], body_size)
                continue

            if batch and (size + body_size > ARCHIVE_BATCH_BYTES or len(batch) >= ARCHIVE_BATCH_DOCUMENTS):
                flush()

            batch.append(document)
            size += body_size

        flush()

        return sent

    # ---- Suppliers ---------------------------------------------------------

    def suppliers(self) -> list[dict[str, Any]]:
        try:
            response = self._session.get(f"{self._base_url}/admin/supply/suppliers", timeout=self._timeout)
        except requests.RequestException as error:
            raise CatalogError(f"{type(error).__name__}: {error}") from error

        if response.status_code >= 400:
            raise CatalogError(f"HTTP {response.status_code}: {response.text[:500]}")

        return response.json()["suppliers"]

    def create_supplier(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._post("/admin/supply/suppliers", payload)["supplier"]

    def open_run(self, supplier_id: str, file_name: str | None) -> dict[str, Any]:
        return self._post(f"/admin/supply/suppliers/{supplier_id}/import-runs", {"file_name": file_name})[
            "import_run"
        ]

    def post_rows(self, run_id: str, rows: list[dict[str, Any]]) -> dict[str, Any]:
        for attempt in range(4):
            try:
                return self._post(f"/admin/supply/import-runs/{run_id}/rows", {"rows": rows})
            except CatalogError as error:
                # The store limits admin writes per minute; wait the window out.
                if "HTTP 429" not in str(error) or attempt == 3:
                    raise

                time.sleep(65)

        raise CatalogError("unreachable")

    def finish_run(self, run_id: str) -> dict[str, Any]:
        return self._post(f"/admin/supply/import-runs/{run_id}/finish", {})["import_run"]
