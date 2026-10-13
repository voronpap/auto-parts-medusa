from __future__ import annotations

from parsers.adapters import Adapter, LookupRequest
from parsers.client import CatalogClient
from parsers.http import PoliteSession, RateLimiter, ResponseCache, SourceError
from parsers.models import Attribute, SourceMeta, SourceResult
from parsers.worker import run_lookup

SOURCE = SourceMeta(key="fake", name="Fake", kind="manufacturer_catalog", license_class="OPEN", lineage="fake")


class FakeResponse:
    def __init__(self, text: str, status: int = 200):
        self.text = text
        self.status_code = status


class FakeSession:
    def __init__(self, pages: dict[str, str]):
        self.headers: dict[str, str] = {}
        self._pages = pages
        self.requests = 0

    def request(self, method, url, **kwargs):
        self.requests += 1

        return FakeResponse(self._pages[url]) if url in self._pages else FakeResponse("nope", 404)


def session(pages, tmp_path):
    return PoliteSession(
        cache=ResponseCache(tmp_path / "cache.sqlite"),
        limiter=RateLimiter(0),
        session=FakeSession(pages),  # type: ignore[arg-type]
    )


class PageAdapter(Adapter):
    def __init__(self, http, urls):
        super().__init__(http)
        self._urls = urls

    @property
    def source(self) -> SourceMeta:
        return SOURCE

    @property
    def brands(self) -> tuple[str, ...]:
        return ("Fake",)

    def lookup(self, request: LookupRequest) -> SourceResult:
        pages = [self.http.fetch(url, params={"n": request.number}) for url in self._urls]

        return SourceResult(attributes=[Attribute(name="Назва", value=pages[-1])])


def test_every_response_behind_a_result_is_recorded_with_its_request(tmp_path):
    http = session({"https://c.example/a": "<p>A</p>", "https://c.example/b": "B"}, tmp_path)
    adapter = PageAdapter(http, ["https://c.example/a", "https://c.example/b"])
    result = run_lookup([adapter], LookupRequest("Fake", "X 1", "aftermarket"), "w")

    assert [(d["url"], d["body"], d["http_status"], d["params"]) for d in result.documents] == [
        ("https://c.example/a", "<p>A</p>", 200, {"n": "X 1"}),
        ("https://c.example/b", "B", 200, {"n": "X 1"}),
    ]
    assert {(d["source_key"], d["source_name"], d["parser_version"]) for d in result.documents} == {
        ("fake", "Fake", "1.0.0")
    }
    # The archive travels separately: it is not part of the result.
    assert "documents" not in result.to_payload()
    assert http.recorder is None


def test_response_served_from_the_cache_is_recorded_with_its_original_time(tmp_path):
    http = session({"https://c.example/a": "A"}, tmp_path)
    adapter = PageAdapter(http, ["https://c.example/a"])
    first = run_lookup([adapter], LookupRequest("Fake", "X 1", "aftermarket"), "w").documents
    second = run_lookup([adapter], LookupRequest("Fake", "X 1", "aftermarket"), "w").documents

    assert http._session.requests == 1
    assert second[0]["request_key"] == first[0]["request_key"]
    assert second[0]["fetched_at"] == first[0]["fetched_at"]


def test_what_was_read_before_a_failure_is_still_kept(tmp_path):
    http = session({"https://c.example/a": "A"}, tmp_path)
    adapter = PageAdapter(http, ["https://c.example/a", "https://c.example/missing"])
    result = run_lookup([adapter], LookupRequest("Fake", "X 1", "aftermarket"), "w")

    assert result.errors and [d["url"] for d in result.documents] == ["https://c.example/a"]


class RecordingClient(CatalogClient):
    def __init__(self):
        self.posts: list[tuple[str, dict]] = []

    def _post(self, path, payload):
        self.posts.append((path, payload))

        return {}


def test_archive_is_sent_in_batches_and_oversized_responses_are_left_out():
    client = RecordingClient()
    documents = [{"url": f"u{i}", "body": "x" * 1_500_000} for i in range(5)] + [
        {"url": "huge", "body": "x" * 6_000_000}
    ]
    sent = client.archive({"brand": "Fake", "number_type": "aftermarket", "number": "X 1"}, documents)

    assert sent == 5
    assert [len(payload["documents"]) for _, payload in client.posts] == [2, 2, 1]
    assert {path for path, _ in client.posts} == {"/admin/parts-catalog/documents"}
    assert client.posts[0][1]["number"]["number"] == "X 1"
