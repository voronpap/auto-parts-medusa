from __future__ import annotations

from datetime import datetime, timezone

import pytest
import requests

from parsers.adapters import Adapter, LookupRequest, normalize_brand
from parsers.http import (
    PoliteSession,
    RateLimiter,
    ResponseCache,
    SourceBlocked,
    SourceError,
)
from parsers.models import (
    Application,
    Attribute,
    NumberRef,
    Relationship,
    SourceMeta,
    SourceResult,
)
from parsers.worker import load_schema, process_tasks, run_lookup

SOURCE = SourceMeta(
    key="fake",
    name="Fake (каталог виробника)",
    kind="manufacturer_catalog",
    license_class="OPEN",
    lineage="fake",
    url="https://catalog.example/",
)


class FakeAdapter(Adapter):
    def __init__(self, result=None, error=None, brands=("Fake", "Fake Parts")):
        super().__init__(http=None)  # type: ignore[arg-type]
        self._result = result
        self._error = error
        self._brands = brands
        self.calls = 0

    @property
    def source(self) -> SourceMeta:
        return SOURCE

    @property
    def brands(self) -> tuple[str, ...]:
        return self._brands

    def lookup(self, request: LookupRequest) -> SourceResult:
        self.calls += 1

        if self._error:
            raise self._error

        return self._result or SourceResult()


def sample_result() -> SourceResult:
    return SourceResult(
        relationships=[
            Relationship(
                to=NumberRef("VAG", "oem", "1K0 615 301 AA"),
                relation_type="OEM_REFERENCE",
                raw_relation_text="OE number",
            ),
            Relationship(to=None, relation_type="DISCONTINUED_NO_REPLACEMENT"),
        ],
        applications=[
            Application(make="Volkswagen", model="Golf", year_from=2003, raw_text="VW GOLF V")
        ],
        attributes=[Attribute(name="Diameter", value="260", unit="mm")],
    )


REQUEST = LookupRequest("FAKE", "0 986 478 123", "aftermarket")


def test_brand_matching_ignores_case_and_punctuation():
    assert normalize_brand("Mercedes-Benz") == normalize_brand("MERCEDES BENZ")
    assert FakeAdapter().supports(LookupRequest("fake-parts", "1", "aftermarket"))
    assert not FakeAdapter().supports(LookupRequest("Other", "1", "aftermarket"))


def test_result_keeps_numbers_as_written_and_names_the_parser():
    adapter = FakeAdapter(sample_result())
    payload = run_lookup([adapter], REQUEST, "w").to_payload()

    assert payload["sources"][0]["key"] == "fake"
    assert payload["sources"][0]["parser"] == {"name": "fake", "version": "1.0.0"}
    assert payload["relationships"][0]["to"]["number"] == "1K0 615 301 AA"
    assert payload["relationships"][0]["source"] == "fake"
    assert payload["relationships"][1]["to"] is None
    assert payload["applications"][0]["make"] == "Volkswagen"
    # Unknown fields are left out rather than sent as nulls.
    assert "engine" not in payload["applications"][0]


def test_adapter_for_another_brand_is_not_asked():
    adapter = FakeAdapter(sample_result(), brands=("Other",))
    result = run_lookup([adapter], REQUEST, "w")

    assert adapter.calls == 0
    assert result.relationships == []
    assert "No adapter covers brand" in result.errors[0]["message"]


def test_a_failing_source_does_not_lose_the_others():
    broken = FakeAdapter(error=SourceError("HTTP 503"))
    crashing = FakeAdapter(error=ValueError("bad markup"))
    working = FakeAdapter(sample_result())
    result = run_lookup([broken, crashing, working], REQUEST, "w")

    assert len(result.relationships) == 2
    assert [error["message"] for error in result.errors] == [
        "HTTP 503",
        "adapter error: ValueError: bad markup",
    ]


def test_empty_result_names_no_source():
    result = run_lookup([FakeAdapter()], REQUEST, "w")

    assert result.sources == [] and result.errors == []


def test_payload_matches_the_catalog_schema():
    schema = load_schema()

    if schema is None:
        pytest.skip("docs/lookup-result.schema.json is not present")

    run_lookup([FakeAdapter(sample_result())], REQUEST, "w", schema)


def test_rate_limiter_spaces_requests_per_host():
    now = [100.0]
    slept: list[float] = []
    limiter = RateLimiter(5.0, clock=lambda: now[0], sleep=slept.append)

    assert limiter.wait("a.example") == 0
    assert limiter.wait("a.example") == 5.0
    assert limiter.wait("b.example") == 0
    now[0] += 20
    assert limiter.wait("a.example") == 0
    assert slept == [5.0]


def test_cache_expires(tmp_path):
    cache = ResponseCache(tmp_path / "c.sqlite", ttl_seconds=60)
    key = ResponseCache.key("GET", "https://x.example/", None)
    cache.put(key, 200, "body", now=1000.0)

    assert cache.get(key, now=1030.0) == (200, "body")
    assert cache.get(key, now=1100.0) is None


class FakeResponse:
    def __init__(self, status_code, text):
        self.status_code = status_code
        self.text = text


class FakeHttp:
    def __init__(self, responses):
        self.headers: dict[str, str] = {}
        self._responses = list(responses)
        self.requests = 0

    def request(self, *args, **kwargs):
        self.requests += 1
        response = self._responses.pop(0)

        if isinstance(response, Exception):
            raise response

        return response


def polite(responses, tmp_path=None):
    http = FakeHttp(responses)
    cache = ResponseCache(tmp_path / "c.sqlite") if tmp_path else None
    limiter = RateLimiter(0.0)

    return PoliteSession(cache=cache, limiter=limiter, session=http), http  # type: ignore[arg-type]


def test_session_identifies_itself():
    session, http = polite([FakeResponse(200, "ok")])
    session.fetch("https://x.example/")

    assert "auto-parts.pp.ua" in http.headers["User-Agent"]


def test_blocked_sources_are_reported_not_bypassed():
    for response in (
        FakeResponse(403, "Forbidden"),
        FakeResponse(429, "slow down"),
        FakeResponse(200, "<title>Just a moment...</title>"),
        FakeResponse(200, "please solve the CAPTCHA"),
    ):
        session, http = polite([response])

        with pytest.raises(SourceBlocked):
            session.fetch("https://x.example/")

        assert http.requests == 1


def test_network_and_server_errors_become_source_errors():
    session, _ = polite([requests.ConnectionError("down")])

    with pytest.raises(SourceError):
        session.fetch("https://x.example/")

    session, _ = polite([FakeResponse(500, "oops")])

    with pytest.raises(SourceError, match="HTTP 500"):
        session.fetch("https://x.example/")


def test_cached_response_is_not_requested_again(tmp_path):
    session, http = polite([FakeResponse(200, '{"a": 1}')], tmp_path)

    assert session.fetch_json("https://x.example/api") == {"a": 1}
    assert session.fetch_json("https://x.example/api") == {"a": 1}
    assert http.requests == 1


class FakeCatalog:
    def __init__(self, tasks):
        self._tasks = tasks
        self.posted: list[tuple[str, dict]] = []

    def claim(self, worker, limit=5):
        tasks, self._tasks = self._tasks, []
        return tasks

    def post_result(self, task_id, payload):
        self.posted.append((task_id, payload))
        return {"summary": {"relationships_added": len(payload["relationships"])}}


def test_worker_posts_one_result_per_claimed_task():
    catalog = FakeCatalog(
        [
            {"id": "t1", "brand": "Fake", "number": "A 1", "number_type": "aftermarket"},
            {"id": "t2", "brand": "Unknown", "number": "B 2", "number_type": "oem"},
        ]
    )
    handled = process_tasks(catalog, [FakeAdapter(sample_result())], "w")  # type: ignore[arg-type]

    assert handled == 2
    assert [task_id for task_id, _ in catalog.posted] == ["t1", "t2"]
    assert len(catalog.posted[0][1]["relationships"]) == 2
    assert catalog.posted[1][1]["relationships"] == []
    assert catalog.posted[1][1]["errors"]


def test_retrieved_at_is_utc_iso():
    from parsers.models import LookupResult

    result = LookupResult(worker="w")
    result.add(SOURCE, "fake", "1.0.0", sample_result(), datetime(2026, 10, 12, 9, 0, tzinfo=timezone.utc))

    assert result.sources[0]["retrieved_at"] == "2026-10-12T09:00:00Z"
