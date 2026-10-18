from __future__ import annotations

import json

import pytest

from parsers.client import CatalogError
from parsers.spool import SpoolClient, upload_spool


class Store:
    def __init__(
        self,
        fail_on: int | None = None,
        refuse: bool = False,
        status_code: int | None = None,
    ):
        self.imports: list[dict] = []
        self.deliveries: list[dict | None] = []
        self.archives: list[tuple] = []
        self._fail_on, self._refuse, self._status_code = fail_on, refuse, status_code

    def import_result(self, payload, delivery=None):
        if self._fail_on is not None and len(self.imports) == self._fail_on:
            self._fail_on = None
            status_code = self._status_code or (400 if self._refuse else None)
            raise CatalogError(
                f"HTTP {status_code}: bad" if status_code else "ConnectionError: down",
                status_code=status_code,
            )

        self.imports.append(payload)
        self.deliveries.append(delivery)

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
    assert store.deliveries[0] == {
        "spool_file": next(tmp_path.glob("*.jsonl")).name,
        "byte_offset": 0,
    }
    # An empty archive is not written at all.
    assert len(store.archives) == 3 and store.archives[0][1][0]["body"] == "б"
    assert totals == {
        "files": 1,
        "imports": 3,
        "archives": 3,
        "relationships": 6,
        "applications": 9,
        "dead_letters": 0,
    }
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
    dead_letters = list((tmp_path / "dead-letter").glob("*.json"))
    assert len(dead_letters) == 1
    entry = json.loads(dead_letters[0].read_text(encoding="utf-8"))
    assert entry["spool_file"] == next(tmp_path.glob("*.jsonl")).name
    assert entry["byte_offset"] > 0
    assert entry["record"]["payload"]["number"]["number"] == "N1"
    assert entry["http_status"] == 400
    assert upload_spool(store, tmp_path, with_archive=True)["dead_letters"] == 0  # type: ignore[arg-type]
    assert len(list((tmp_path / "dead-letter").glob("*.json"))) == 1


def test_a_conflict_response_is_retried_without_advancing_the_cursor(tmp_path):
    collect(tmp_path, count=1)
    store = Store(fail_on=0, status_code=409)
    position_file = next(tmp_path.glob("*.jsonl")).with_suffix(".pos")

    with pytest.raises(CatalogError):
        upload_spool(store, tmp_path)  # type: ignore[arg-type]

    assert not position_file.exists() or position_file.read_text() == "0\n"
    assert not (tmp_path / "dead-letter").exists()
    upload_spool(store, tmp_path)  # type: ignore[arg-type]
    assert [item["number"]["number"] for item in store.imports] == ["N0"]


def test_a_dead_letter_write_failure_does_not_advance_the_cursor(
    tmp_path, monkeypatch
):
    from parsers import spool

    collect(tmp_path, count=2)
    path = next(tmp_path.glob("*.jsonl"))
    with path.open("rb") as spool_file:
        lines_before_failure = spool_file.readline() + spool_file.readline()
    expected_position = len(lines_before_failure)
    position_file = path.with_suffix(".pos")
    store = Store(fail_on=1, refuse=True)

    def fail_to_save(*args, **kwargs):
        raise OSError("disk full")

    monkeypatch.setattr(spool, "_record_dead_letter", fail_to_save)

    with pytest.raises(OSError, match="disk full"):
        upload_spool(store, tmp_path)  # type: ignore[arg-type]

    assert int(position_file.read_text()) == expected_position


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
