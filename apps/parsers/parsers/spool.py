"""Collect now, load later.

A bulk run can keep what it read in files on its own machine instead of
sending every result to the store at once, and the files are loaded into the
store whenever that suits — at night, or when the store's server is free.

    PARSERS_SPOOL_DIR=spool python -m parsers import-numbers ...   # collects
    python -m parsers upload-spool --dir spool                     # loads

One line of a spool file is one request to the store, exactly as it would
have been sent. Loading keeps its place in a ".pos" file beside each spool
file, so it can be stopped, started again, and run while a collection is
still appending to the same files.
"""

from __future__ import annotations

import json
import hashlib
import logging
import os
import tempfile
import time
from pathlib import Path
from typing import Any

from .client import CatalogClient, CatalogError

log = logging.getLogger("parsers")

RETRYABLE_CLIENT_ERRORS = {401, 408, 409, 425, 429}


def _write_durable(path: Path, contents: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.", suffix=".tmp", dir=path.parent
    )
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as temporary:
            temporary.write(contents)
            temporary.flush()
            os.fsync(temporary.fileno())
        os.replace(temporary_path, path)
        if os.name != "nt":
            directory_fd = os.open(path.parent, os.O_RDONLY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
    finally:
        temporary_path.unlink(missing_ok=True)


def _dead_letter_path(directory: Path, spool_path: Path, offset: int) -> Path:
    spool_id = hashlib.sha256(spool_path.name.encode("utf-8")).hexdigest()[:16]
    return directory / "dead-letter" / f"{spool_id}-{offset}.json"


def _record_dead_letter(
    directory: Path,
    spool_path: Path,
    offset: int,
    record: dict[str, Any],
    error: CatalogError,
) -> None:
    dead_letter_path = _dead_letter_path(directory, spool_path, offset)
    if dead_letter_path.exists():
        saved = json.loads(dead_letter_path.read_text(encoding="utf-8"))
        if (
            saved.get("spool_file") != spool_path.name
            or saved.get("byte_offset") != offset
            or saved.get("record") != record
        ):
            raise RuntimeError(f"Conflicting dead-letter entry: {dead_letter_path}")
        return

    dead_letter = {
        "spool_file": spool_path.name,
        "byte_offset": offset,
        "http_status": error.status_code,
        "error": str(error),
        "record": record,
        "recorded_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    _write_durable(
        dead_letter_path,
        (json.dumps(dead_letter, ensure_ascii=False) + "\n").encode("utf-8"),
    )


def _save_position(path: Path, position: int) -> None:
    _write_durable(path, f"{position}\n".encode("ascii"))


class SpoolClient:
    """Stands in for the catalog client during a collection: every write is
    appended to a file instead of being sent."""

    def __init__(self, directory: Path, worker: str) -> None:
        directory.mkdir(parents=True, exist_ok=True)
        name = "".join(c if c.isalnum() or c in "-_" else "-" for c in worker)
        self._path = directory / f"{name}-{int(time.time())}-{os.getpid()}.jsonl"

    def _append(self, kind: str, body: dict[str, Any]) -> None:
        with self._path.open("a", encoding="utf-8") as spool:
            spool.write(json.dumps({"kind": kind, **body}, ensure_ascii=False) + "\n")

    def import_result(self, payload: dict[str, Any]) -> dict[str, Any]:
        self._append("import", {"payload": payload})

        # What was added is known only when the store has taken it.
        return {"summary": {}}

    def archive(self, number: dict[str, Any] | None, documents: list[dict[str, Any]]) -> int:
        if documents:
            self._append("archive", {"number": number, "documents": documents})

        return len(documents)


def upload_spool(
    client: CatalogClient, directory: Path, pause: float = 0.0, with_archive: bool = False
) -> dict[str, int]:
    """Sends every complete line not yet sent, oldest file first.

    Raw responses are large (pages of some catalogues run to megabytes per
    number), so they are sent only when asked for; otherwise they stay in the
    spool files, which then are the archive of the run."""
    totals = {
        "files": 0,
        "imports": 0,
        "archives": 0,
        "relationships": 0,
        "applications": 0,
        "dead_letters": 0,
    }

    for path in sorted(directory.glob("*.jsonl"), key=lambda item: item.stat().st_mtime):
        position_file = path.with_suffix(".pos")
        position = int(position_file.read_text()) if position_file.exists() else 0

        with path.open("rb") as spool:
            spool.seek(position)

            while True:
                line = spool.readline()

                # A line still being written has no newline yet; it waits.
                if not line.endswith(b"\n"):
                    break

                record = json.loads(line)

                try:
                    if record["kind"] == "import":
                        summary = client.import_result(
                            record["payload"],
                            delivery={"spool_file": path.name, "byte_offset": position},
                        ).get("summary", {})
                        totals["imports"] += 1
                        totals["relationships"] += summary.get("relationships_added", 0) + summary.get(
                            "relationships_confirmed", 0
                        )
                        totals["applications"] += summary.get("applications_added", 0)
                    elif with_archive:
                        client.archive(record.get("number"), record["documents"])
                        totals["archives"] += 1
                except CatalogError as error:
                    status = error.status_code
                    if (
                        status is not None
                        and 400 <= status < 500
                        and status not in RETRYABLE_CLIENT_ERRORS
                    ):
                        _record_dead_letter(directory, path, position, record, error)
                        totals["dead_letters"] += 1
                        log.error(
                            "%s at byte %d was recorded in dead-letter before advancing: %s",
                            path.name,
                            position,
                            error,
                        )
                    else:
                        log.error("Loading stopped at %s byte %d: %s", path.name, position, error)
                        raise

                position = spool.tell()
                _save_position(position_file, position)

                if (totals["imports"] + totals["archives"]) % 200 == 0:
                    log.info("loaded so far: %s", json.dumps(totals))

                if pause:
                    time.sleep(pause)

        totals["files"] += 1

    return totals
