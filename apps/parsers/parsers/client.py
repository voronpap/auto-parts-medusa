"""Client for the catalog's lookup-task API."""

from __future__ import annotations

from typing import Any

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
