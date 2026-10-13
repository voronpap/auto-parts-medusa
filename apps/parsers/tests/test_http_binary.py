import base64

import pytest

from parsers.client import ARCHIVE_MAX_BODY
from parsers.http import PoliteSession, RateLimiter, ResponseCache, SourceBlocked, SourceError


class Response:
    def __init__(self, content=b"%PDF-1.7\x00\xff\x80", status=200, mime="application/pdf"):
        self.content = content
        self.text = "text representation must not be used for binary data"
        self.status_code = status
        self.headers = {"Content-Type": mime}


class Session:
    def __init__(self, response=None):
        self.headers = {}
        self.response = response or Response()
        self.calls = []

    def request(self, method, url, **kwargs):
        self.calls.append((method, url, kwargs))
        assert "verify" not in kwargs
        return self.response


def make_http(tmp_path, response=None):
    raw = Session(response)
    http = PoliteSession(cache=ResponseCache(tmp_path / "binary.sqlite"), limiter=RateLimiter(0), session=raw)
    http.recorder = []
    return http, raw


def test_binary_archive_is_lossless_without_new_document_fields(tmp_path):
    http, raw = make_http(tmp_path)
    content = http.fetch_bytes("https://example.invalid/catalog.pdf", params={"edition": "2026"})
    doc = http.recorder[0]
    assert content == raw.response.content
    assert doc["body"].startswith("data:application/pdf;base64,")
    assert base64.b64decode(doc["body"].split(",", 1)[1]) == content
    assert doc["params"] == {"edition": "2026"} and doc["method"] == "GET"
    assert len(doc["body"].encode("utf-8")) < ARCHIVE_MAX_BODY


def test_binary_cache_keeps_original_archive_time_and_avoids_second_request(tmp_path):
    http, raw = make_http(tmp_path)
    first = http.fetch_bytes("https://example.invalid/catalog.pdf")
    second = http.fetch_bytes("https://example.invalid/catalog.pdf")
    assert first == second and len(raw.calls) == 1
    assert http.recorder[0]["fetched_at"] == http.recorder[1]["fetched_at"]
    assert http.recorder[0]["body"] == http.recorder[1]["body"]


def test_text_and_binary_have_distinct_cache_keys(tmp_path):
    http, raw = make_http(tmp_path)
    binary = http.fetch_bytes("https://example.invalid/file")
    text = http.fetch("https://example.invalid/file")
    assert len(raw.calls) == 2 and text == raw.response.text and binary == raw.response.content
    assert http.recorder[0]["request_key"] != http.recorder[1]["request_key"]


@pytest.mark.parametrize("status", [401, 403, 407, 429, 451])
def test_binary_http_refusal_is_not_retried_or_cached(tmp_path, status):
    http, raw = make_http(tmp_path, Response(status=status))
    with pytest.raises(SourceBlocked):
        http.fetch_bytes("https://example.invalid/catalog.pdf")
    assert len(raw.calls) == 1 and http.recorder == []


def test_html_challenge_is_not_a_binary_file(tmp_path):
    http, raw = make_http(tmp_path, Response(b"<html>captcha</html>", mime="text/html"))
    with pytest.raises(SourceBlocked):
        http.fetch_bytes("https://example.invalid/catalog.pdf")
    assert len(raw.calls) == 1


def test_binary_size_cap_applies_to_network_and_cache(tmp_path):
    http, _ = make_http(tmp_path, Response(b"12345"))
    with pytest.raises(SourceError, match="size limit"):
        http.fetch_bytes("https://example.invalid/file", max_bytes=4)
    assert http.recorder == []
    assert http.fetch_bytes("https://example.invalid/file") == b"12345"
    with pytest.raises(SourceError, match="size limit"):
        http.fetch_bytes("https://example.invalid/file", max_bytes=4)
    with pytest.raises(ValueError):
        http.fetch_bytes("https://example.invalid/file", max_bytes=4_000_001)


def test_invalid_mime_does_not_inject_data_uri_fields(tmp_path):
    http, _ = make_http(tmp_path, Response(mime="not/a/type; charset=utf-8"))
    http.fetch_bytes("https://example.invalid/file")
    assert http.recorder[0]["body"].startswith("data:application/octet-stream;base64,")


def test_error_status_is_not_accepted_as_file(tmp_path):
    http, _ = make_http(tmp_path, Response(status=404))
    with pytest.raises(SourceError, match="HTTP 404"):
        http.fetch_bytes("https://example.invalid/file")
    assert http.recorder == []
