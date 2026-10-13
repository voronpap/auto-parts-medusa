import base64
import hashlib
import json

import pytest

from parsers.http import SourceError
from tools.download_catalogue import download


class FakeHttp:
    def __init__(self, content=b"%PDF-1.5\x00\xff", failure=False):
        self.content = content
        self.failure = failure
        self.recorder = [{"earlier": "record"}]
        self.calls = []

    def fetch_bytes(self, url):
        self.calls.append(url)
        if self.failure:
            raise SourceError("source unavailable")
        self.recorder.append({"url": url, "body": "data:application/pdf;base64," + base64.b64encode(self.content).decode("ascii"),
                              "http_status": 200, "fetched_at": "2026-10-13T00:00:00Z"})
        return self.content


def invoke(http, tmp_path, url="https://example.invalid/catalog.pdf", filename="catalog.pdf"):
    return download(http, url, tmp_path / filename, tmp_path / "response.json", "cina-auto-parts", "Cina Auto Parts", "1.0.0")


def test_download_uses_polite_binary_fetch_and_preserves_raw_record(tmp_path):
    http = FakeHttp()
    previous = http.recorder
    summary = invoke(http, tmp_path)
    assert http.calls == ["https://example.invalid/catalog.pdf"]
    assert http.recorder is previous and previous == [{"earlier": "record"}]
    assert (tmp_path / "catalog.pdf").read_bytes() == http.content
    doc = json.loads((tmp_path / "response.json").read_text(encoding="utf-8"))["documents"][0]
    assert base64.b64decode(doc["body"].split(",", 1)[1]) == http.content
    assert doc["source_key"] == "cina-auto-parts" and doc["parser_version"] == "1.0.0"
    assert summary == {"bytes": len(http.content), "sha256": hashlib.sha256(http.content).hexdigest(), "documents": 1}


@pytest.mark.parametrize("url", ["http://example.invalid/file", "https://user:password@example.invalid/file"])
def test_insecure_or_credential_url_is_not_requested(tmp_path, url):
    http = FakeHttp()
    with pytest.raises(ValueError):
        invoke(http, tmp_path, url)
    assert http.calls == []


@pytest.mark.parametrize("name", ["catalog.pdf", "response.json"])
def test_existing_files_are_preserved_before_any_request(tmp_path, name):
    target = tmp_path / name
    target.write_bytes(b"existing user file")
    http = FakeHttp()
    with pytest.raises(FileExistsError):
        invoke(http, tmp_path)
    assert target.read_bytes() == b"existing user file" and http.calls == []


def test_same_output_paths_are_refused(tmp_path):
    target = tmp_path / "catalog.pdf"
    http = FakeHttp()
    with pytest.raises(FileExistsError):
        download(http, "https://example.invalid/catalog.pdf", target, target, "cina", "Cina", "1.0.0")
    assert http.calls == []


@pytest.mark.parametrize("filename", ["catalog.pdf", "catalog.xlsx"])
def test_wrong_file_magic_is_not_written(tmp_path, filename):
    http = FakeHttp(b"<html>not a catalogue</html>")
    with pytest.raises(SourceError):
        invoke(http, tmp_path, filename=filename)
    assert list(tmp_path.iterdir()) == [] and http.recorder == [{"earlier": "record"}]


def test_failure_restores_previous_recorder_without_creating_files(tmp_path):
    http = FakeHttp(failure=True)
    previous = http.recorder
    with pytest.raises(SourceError):
        invoke(http, tmp_path)
    assert http.recorder is previous and list(tmp_path.iterdir()) == []
