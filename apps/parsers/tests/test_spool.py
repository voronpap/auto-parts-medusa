from __future__ import annotations

import json

import pytest

from parsers.client import CatalogError
from parsers.spool import SpoolClient, upload_spool


class Store:
    def __init__(self, fail_on: int | None = None, refuse: bool = False):
        self.imports: list[dict] = []
        self.archives: list[tuple] = []
        self._fail_on, self._refuse = fail_on, refuse

    def import_result(self, payload):
        if self._fail_on is not None and len(self.imports) == self._fail_on:
            self._fail_on = None
            raise CatalogError("HTTP 400: bad" if self._refuse else "ConnectionError: down")

        self.imports.append(payload)

        return {"summary": {"relationships_added": 2, "applications_added": 3}}

    def archive(self, number, documents):
        self.archives.append((number, documents))

        return len(documents)


def collect(tmp_path, count=3):
    spool = SpoolClient(tmp_path, "harvest price/bosch")

    for index in range(count):
        assert spool.import_result({"number": {"number": f"N{index}"}}) == {"summary": {}}
        spool.archive({"number": f"N{index}"}, [{"url": "u", "body": "б"}])

    spool.archive(None, [])


def test_collection_is_kept_in_a_file_and_loaded_in_order(tmp_path):
    collect(tmp_path)
    store = Store()
    totals = upload_spool(store, tmp_path, with_archive=True)  # type: ignore[arg-type]

    assert [p["number"]["number"] for p in store.imports] == ["N0", "N1", "N2"]
    # An empty archive is not written at all.
    assert len(store.archives) == 3 and store.archives[0][1][0]["body"] == "б"
    assert totals == {"files": 1, "imports": 3, "archives": 3, "relationships": 6, "applications": 9}
    # A second run finds nothing left to send.
    assert upload_spool(store, tmp_path, with_archive=True)["imports"] == 0  # type: ignore[arg-type]
    assert len(store.imports) == 3


def test_loading_continues_from_where_the_store_went_away(tmp_path):
    collect(tmp_path)
    store = Store(fail_on=1)

    with pytest.raises(CatalogError):
        upload_spool(store, tmp_path, with_archive=True)  # type: ignore[arg-type]

    upload_spool(store, tmp_path, with_archive=True)  # type: ignore[arg-type]

    assert [p["number"]["number"] for p in store.imports] == ["N0", "N1", "N2"]
    assert len(store.archives) == 3


def test_a_result_the_store_refuses_does_not_hold_the_rest(tmp_path):
    collect(tmp_path)
    store = Store(fail_on=1, refuse=True)
    upload_spool(store, tmp_path, with_archive=True)  # type: ignore[arg-type]

    assert [p["number"]["number"] for p in store.imports] == ["N0", "N2"]


def test_a_line_still_being_written_waits_for_the_next_run(tmp_path):
    collect(tmp_path, count=1)
    path = next(tmp_path.glob("*.jsonl"))

    with path.open("a", encoding="utf-8") as spool:
        spool.write(json.dumps({"kind": "import", "payload": {"number": {"number": "HALF"}}})[:20])

    store = Store()
    upload_spool(store, tmp_path, with_archive=True)  # type: ignore[arg-type]

    assert [p["number"]["number"] for p in store.imports] == ["N0"]


def test_raw_responses_stay_in_the_files_unless_asked_for(tmp_path):
    collect(tmp_path)
    store = Store()
    totals = upload_spool(store, tmp_path)  # type: ignore[arg-type]

    assert len(store.imports) == 3 and store.archives == [] and totals["archives"] == 0
