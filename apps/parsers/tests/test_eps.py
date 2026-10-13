import json
from pathlib import Path

import pytest

from parsers.adapters import ADAPTERS, LookupRequest
from parsers.adapters.eps import BASE_URL, EpsAdapter
from parsers.adapters.facet import FacetAdapter, initial_controls
from parsers.http import PoliteSession, RateLimiter, SourceBlocked, SourceError
from parsers.worker import load_schema, run_lookup

FIXTURES = Path(__file__).parent / "fixtures"


def fixture(name):
    return (FIXTURES / ("eps_" + name)).read_text(encoding="utf-8")


def reply(html):
    return "/*DX*/(" + json.dumps({"id": 0, "result": {"stateObject": {"keys": [], "pageCount": 1, "pageSize": 15, "pageIndex": 0}, "html": "<%html%>"}}) + ")/*DXHTML*/" + html


class FakeHttp:
    def __init__(self, metadata=None):
        self.metadata = metadata
        self.calls = []

    def fetch_json(self, url, **kwargs):
        self.calls.append((url, kwargs))
        assert url.startswith(BASE_URL + "/Home/")
        code = kwargs["form_body"]["codfacetFinale"]
        return self.metadata or json.loads(fixture("metadata_" + ("1.970.127" if code == "1.970.127" else "1.957.001") + ".json"))

    def fetch(self, url, **kwargs):
        self.calls.append((url, kwargs))
        assert url.startswith(BASE_URL)
        if url == BASE_URL:
            return fixture("bootstrap.html")
        control = kwargs["form_body"]["DXCallbackName"]
        code = kwargs["form_body"]["SessionName"]
        if control in ("GVArticoliOE2", "GVArticoliCR2"):
            return reply(fixture("search_" + control + ".html"))
        name = "references" if control == "GVcrossReferenceBig" else "applications"
        return reply(fixture(name + "_" + code + ".html"))


def test_native_eps_identity_not_facet_photo_code():
    result = EpsAdapter(FakeHttp()).lookup(LookupRequest("EPS", "1.957.001", "aftermarket"))
    assert len(result.relationships) == 18 and len(result.applications) == 3
    assert any(a.name == "Cod" and a.value == "1.957.001" for a in result.attributes)
    assert not any(a.value == "9.3001" for a in result.attributes)
    assert all(r.record_ref == "EPS 1.957.001" and r.record_url.startswith(BASE_URL) for r in result.relationships)
    assert any(r.to.brand == "MG" and r.to.number == "NSC90019C" for r in result.relationships)


def test_native_ignition_coil_and_spaced_oe_spelling():
    result = EpsAdapter(FakeHttp()).lookup(LookupRequest("EPS", "1.970.127", "aftermarket"))
    assert len(result.relationships) == 6 and len(result.applications) == 2
    assert any(r.to.number == "811 905 115" and r.to.brand == "AUDI" for r in result.relationships)
    assert any(r.to.brand == "FACET" and r.to.number == "9.6027" for r in result.relationships)


def test_foreign_mg_is_incoming_to_native_eps_code():
    result = EpsAdapter(FakeHttp()).lookup_foreign(LookupRequest("MG", "NSC90019C", "oem"))
    assert len(result.relationships) == 1
    cross = result.relationships[0]
    assert (cross.to.brand, cross.to.number, cross.direction) == ("EPS", "1.957.001", "incoming")
    assert cross.record_url.startswith(BASE_URL) and cross.record_ref == "EPS 1.957.001"


def test_same_oe_under_wrong_maker_is_not_accepted():
    assert EpsAdapter(FakeHttp()).lookup_foreign(LookupRequest("Geely", "NSC90019C", "oem")).is_empty


def test_source_brand_title_must_match_native_host():
    with pytest.raises(SourceError, match="identity"):
        initial_controls(fixture("bootstrap.html"))
    assert initial_controls(fixture("bootstrap.html"), "EPS Catalog")


@pytest.mark.parametrize("number", ["1.957.00", "1.957.001A", "9.3001"])
def test_photo_or_fuzzy_number_is_not_a_native_match(number):
    assert EpsAdapter(FakeHttp()).lookup(LookupRequest("EPS", number, "aftermarket")).is_empty


def test_other_own_brand_never_uses_eps_catalogue():
    http = FakeHttp()
    assert EpsAdapter(http).lookup(LookupRequest("FACET", "1.957.001", "aftermarket")).is_empty
    assert http.calls == []


def test_common_lineage_and_independent_native_source_names():
    adapter = EpsAdapter(FakeHttp())
    assert adapter.source.lineage == FacetAdapter(FakeHttp()).source.lineage == "FACET"
    assert adapter.source.name == "EPS (каталог виробника)" and adapter.source.key == "eps"
    assert EpsAdapter in ADAPTERS and adapter.min_interval >= 5


def test_schema_and_raw_forms_stay_on_eps_host():
    fake = FakeHttp()
    class Response:
        status_code = 200
        def __init__(self, text):
            self.text = text
    class Session:
        headers = {}
        def request(self, method, url, **kwargs):
            if url.endswith("DettaglioFinale"):
                return Response(json.dumps(fake.fetch_json(url, method=method, form_body=kwargs["data"])))
            return Response(fake.fetch(url, method=method, form_body=kwargs.get("data")))
    http = PoliteSession(session=Session(), limiter=RateLimiter(0))
    result = run_lookup([EpsAdapter(http)], LookupRequest("EPS", "1.957.001", "aftermarket"), "test", load_schema())
    assert result.errors == [] and len(result.documents) == 5
    assert all(d["url"].startswith(BASE_URL) for d in result.documents)
    assert json.loads(result.documents[1]["body"]) == json.loads(fixture("metadata_1.957.001.json"))


def test_refusal_is_propagated_without_alternate_host():
    class Blocked(FakeHttp):
        def fetch(self, url, **kwargs):
            self.calls.append((url, kwargs))
            raise SourceBlocked("HTTP 403")
    http = Blocked()
    with pytest.raises(SourceBlocked):
        EpsAdapter(http).lookup(LookupRequest("EPS", "1.957.001", "aftermarket"))
    assert len(http.calls) == 1 and http.calls[0][0] == BASE_URL
