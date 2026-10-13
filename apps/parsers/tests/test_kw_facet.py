import json
from pathlib import Path

import pytest

from parsers.adapters import ADAPTERS, LookupRequest
from parsers.adapters.facet import initial_controls
from parsers.adapters.kw_facet import BASE_URL, KwFacetAdapter
from parsers.http import PoliteSession, RateLimiter, SourceBlocked, SourceError
from parsers.worker import load_schema, run_lookup

FIXTURES = Path(__file__).parent / "fixtures"


def fixture(name):
    return (FIXTURES / ("kw_facet_" + name)).read_text(encoding="utf-8")


def reply(html):
    return "/*DX*/(" + json.dumps({"id": 0, "result": {"stateObject": {"keys": [], "pageCount": 1, "pageSize": 15, "pageIndex": 0}, "html": "<%html%>"}}) + ")/*DXHTML*/" + html


class FakeHttp:
    def __init__(self, metadata=None):
        self.metadata = metadata
        self.calls = []

    def fetch_json(self, url, **kwargs):
        self.calls.append((url, kwargs))
        assert url == BASE_URL + "/Home/DettaglioFinale"
        code = kwargs["form_body"]["codfacetFinale"]
        return self.metadata or json.loads(fixture("metadata_" + ("470_127" if code == "470 127" else "457_001") + ".json"))

    def fetch(self, url, **kwargs):
        self.calls.append((url, kwargs))
        assert url.startswith(BASE_URL)
        if url == BASE_URL:
            return fixture("bootstrap.html")
        control = kwargs["form_body"]["DXCallbackName"]
        code = kwargs["form_body"]["SessionName"]
        if control in ("GVArticoliOE2", "GVArticoliCR2"):
            return reply(fixture("search_" + control + ".html"))
        if control == "GVArticoliFacet2":
            return reply(fixture("search_own.html"))
        name = "references" if control == "GVcrossReferenceBig" else "applications"
        return reply(fixture(name + "_" + code.replace(" ", "_") + ".html"))


def test_native_kw_code_keeps_spaces_and_ignores_facet_photo_code():
    result = KwFacetAdapter(FakeHttp()).lookup(LookupRequest("KW", "457 001", "aftermarket"))
    assert len(result.relationships) == 18 and len(result.applications) == 3
    assert any(a.name == "Cod" and a.value == "457 001" for a in result.attributes)
    assert not any(a.value == "9.3001" for a in result.attributes)
    assert all(r.record_ref == "KW 457 001" and r.record_url.startswith(BASE_URL) for r in result.relationships)
    assert any(r.to.brand == "MG" and r.to.number == "NSC90019C" for r in result.relationships)


def test_native_coil_has_explicit_oe_and_sister_brand_reference():
    result = KwFacetAdapter(FakeHttp()).lookup(LookupRequest("KW", "470 127", "aftermarket"))
    assert len(result.relationships) == 6 and len(result.applications) == 2
    assert any(r.to.brand == "AUDI" and r.to.number == "811 905 115" for r in result.relationships)
    assert any(r.to.brand == "FACET" and r.to.number == "9.6027" for r in result.relationships)


def test_foreign_oe_is_incoming_to_native_spaced_kw_number():
    result = KwFacetAdapter(FakeHttp()).lookup_foreign(LookupRequest("MG", "NSC90019C", "oem"))
    assert len(result.relationships) == 1
    cross = result.relationships[0]
    assert (cross.to.brand, cross.to.number, cross.direction) == ("KW", "457 001", "incoming")
    assert cross.record_ref == "KW 457 001" and cross.record_url.startswith(BASE_URL)


def test_same_oe_number_under_another_make_is_rejected():
    assert KwFacetAdapter(FakeHttp()).lookup_foreign(LookupRequest("Chery", "NSC90019C", "oem")).is_empty


def test_native_title_cannot_be_replaced_by_eps_or_facet_title():
    with pytest.raises(SourceError, match="identity"):
        initial_controls(fixture("bootstrap.html"), "EPS Catalog")
    assert initial_controls(fixture("bootstrap.html"), "KW Catalog")


@pytest.mark.parametrize("number", ["457 00", "457 001A", "9.3001", "1.957.001"])
def test_photo_sister_brand_or_fuzzy_number_is_not_native(number):
    assert KwFacetAdapter(FakeHttp()).lookup(LookupRequest("KW", number, "aftermarket")).is_empty


def test_unrelated_suspension_brand_and_other_brands_do_not_contact_source():
    http = FakeHttp()
    adapter = KwFacetAdapter(http)
    for brand in ("KW Suspensions", "FACET", "EPS"):
        assert adapter.lookup(LookupRequest(brand, "457 001", "aftermarket")).is_empty
    assert http.calls == []


def test_native_source_name_registration_and_common_lineage():
    adapter = KwFacetAdapter(FakeHttp())
    assert adapter.source.key == "kw-facet" and adapter.source.name == "KW (Facet) (каталог виробника)"
    assert adapter.source.lineage == "FACET" and adapter.brands == ("KW",)
    assert KwFacetAdapter in ADAPTERS and adapter.min_interval >= 5


def test_schema_and_unmodified_raw_data_stay_on_kw_host():
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
    result = run_lookup([KwFacetAdapter(http)], LookupRequest("KW", "457 001", "aftermarket"), "test", load_schema())
    assert result.errors == [] and len(result.documents) == 5
    assert all(d["url"].startswith(BASE_URL) for d in result.documents)
    assert json.loads(result.documents[1]["body"]) == json.loads(fixture("metadata_457_001.json"))
    assert result.documents[1]["params"]["form"] == {"codfacetFinale": "457 001"}


def test_refusal_is_propagated_without_other_host_or_challenge_calls():
    class Blocked(FakeHttp):
        def fetch(self, url, **kwargs):
            self.calls.append((url, kwargs))
            raise SourceBlocked("HTTP 403")
    http = Blocked()
    with pytest.raises(SourceBlocked):
        KwFacetAdapter(http).lookup(LookupRequest("KW", "457 001", "aftermarket"))
    assert len(http.calls) == 1 and http.calls[0][0] == BASE_URL


def test_compact_kw_query_resolves_source_written_spaces_without_guessing():
    class Exact(FakeHttp):
        def fetch_json(self, url, **kwargs):
            if kwargs["form_body"]["codfacetFinale"] == "470127":
                self.calls.append((url, kwargs))
                return {"Success": False}
            return super().fetch_json(url, **kwargs)
    http = Exact()
    result = KwFacetAdapter(http).lookup(LookupRequest("KW", "470127", "aftermarket"))
    assert len(result.relationships) == 6
    assert any(a.name == "Cod" and a.value == "470 127" for a in result.attributes)
    assert [kw["form_body"]["codfacetFinale"] for url, kw in http.calls if url.endswith("DettaglioFinale")] == ["470127", "470 127"]
