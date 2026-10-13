import json
from pathlib import Path

import pytest

from parsers.adapters import LookupRequest
from parsers.adapters.zf import API_URL, FITMENT_URL, ZfAdapter, parse_details, parse_fitment
from parsers.http import PoliteSession, RateLimiter, SourceBlocked
from parsers.worker import load_schema, run_lookup

FIXTURES = Path(__file__).parent / "fixtures"


def fixture(name):
    return json.loads((FIXTURES / f"zf_{name}.json").read_text(encoding="utf-8"))


class FakeHttp:
    def __init__(self):
        self.calls = []

    def fetch_json(self, url, params=None, **kwargs):
        self.calls.append((url, params, kwargs))
        if url == f"{API_URL}/search":
            return fixture(f"search_{params['term']}")
        if url == FITMENT_URL:
            return fixture("fitment_3000_951_003" if params["articleID"] == "3000 951 003" else "fitment_GDB1330")
        return fixture(f"details_{url.rsplit('/', 1)[-1].replace('+', '_')}")


def test_fuzzy_neighbours_and_suffixes_are_not_own_product():
    http = FakeHttp()
    data = ZfAdapter(http).lookup(LookupRequest("TRW", "GDB 1330", "aftermarket"))
    assert (f"{API_URL}/articles/GDB1330",) == tuple(c[0] for c in http.calls if "/articles/" in c[0])
    assert any(r.to.number == "10030811" and r.to.brand == "MG" for r in data.relationships)


def test_numbers_keep_internal_spaces_suffixes_and_zeros():
    data = parse_details(fixture("details_GDB1212"), "u")
    assert "0000009947935" in {r.to.number for r in data.relationships}
    data = parse_details(fixture("details_GDB1330"), "u")
    assert "1H0 698 451 D" in {r.to.number for r in data.relationships}
    assert "20553 04" in {r.to.number for r in data.relationships}
    assert all("Comparable OE Numbers:" in r.raw_relation_text for r in data.relationships if r.relation_type == "OEM_REFERENCE")


def test_oe_makers_are_explicit_not_inferred_from_fitment():
    data = parse_details(fixture("details_GDB1330"), "u")
    assert ("MG", "10030811") in {(r.to.brand, r.to.number) for r in data.relationships}
    assert ("MG (SAIC)", "10030811") in {(r.to.brand, r.to.number) for r in data.relationships}
    assert not any(r.ambiguous for r in data.relationships)


def test_unlabelled_oe_is_preserved_without_guessing_a_make():
    d = fixture("details_GDB1330")
    d["specifications"]["content"]["referenceNumbers"]["referenceNumbers"] = [
        {"label":"", "values":[{"text":"00 123-45A"}]}]
    result = parse_details(d, "u")
    assert not any(r.relation_type == "OEM_REFERENCE" for r in result.relationships)
    assert "00 123-45A" in {a.value for a in result.attributes}


def test_foreign_match_needs_number_under_requested_maker():
    adapter = ZfAdapter(FakeHttp())
    data = adapter.lookup_foreign(LookupRequest("MG", "10030811", "oem"))
    assert {(r.to.brand, r.to.number, r.direction) for r in data.relationships} == {
        ("TRW", "GDB1330", "incoming"), ("TRW", "GDB1330DTE", "incoming")}
    assert adapter.lookup_foreign(LookupRequest("Toyota", "10030811", "oem")).is_empty


def test_found_via_without_reference_is_not_a_cross():
    class Unconfirmed(FakeHttp):
        def fetch_json(self, url, **kwargs):
            d = super().fetch_json(url, **kwargs)
            if "/articles/" in url:
                d["specifications"]["content"]["referenceNumbers"] = None
            return d
    assert ZfAdapter(Unconfirmed()).lookup_foreign(LookupRequest("MG", "10030811", "oem")).is_empty


def test_wrong_own_brand_rejects_the_same_number():
    http = FakeHttp()
    assert ZfAdapter(http).lookup(LookupRequest("SACHS", "GDB1330", "aftermarket")).is_empty
    assert not any("/articles/" in c[0] for c in http.calls)


@pytest.mark.parametrize("field,value", [("brandName", "SACHS"), ("number", "GDB1335")])
def test_wrong_detail_identity_is_rejected(field, value):
    class Wrong(FakeHttp):
        def fetch_json(self, url, **kwargs):
            d = super().fetch_json(url, **kwargs)
            if "/articles/" in url:
                d["details"][field] = value
            return d
    assert ZfAdapter(Wrong()).lookup(LookupRequest("TRW", "GDB1330", "aftermarket")).is_empty
    assert ZfAdapter(Wrong()).lookup_foreign(LookupRequest("MG", "10030811", "oem")).is_empty


def test_supersession_direction_and_status_are_not_confused():
    data = ZfAdapter(FakeHttp()).lookup(LookupRequest("TRW", "GDB1338", "aftermarket"))
    replacements = [r for r in data.relationships if r.relation_type == "SUPERSEDED_BY"]
    assert [(r.to.brand, r.to.number, r.direction) for r in replacements] == [("TRW", "GDB1212", None)]
    assert not any(r.relation_type == "DISCONTINUED_NO_REPLACEMENT" for r in data.relationships)
    assert replacements[0].raw_relation_text == "Replaced by: GDB1212"


def test_vehicle_dates_power_engine_and_conditions_are_preserved():
    data = parse_fitment(fixture("fitment_GDB1330"), "GDB1330", "u")
    vehicle = data[0]
    assert (vehicle.make, vehicle.model, vehicle.engine) == ("AUDI", "A1 (8X1, 8XK)", "1.0 TFSI")
    assert (vehicle.year_from, vehicle.year_to, vehicle.power_kw) == (2016, 2018, 60)
    assert vehicle.position == "Rear Axle"
    assert vehicle.constraints["Fitting Position"] == ["Rear Axle"]
    assert "201601" in vehicle.raw_text and "Rear Axle" in vehicle.raw_text
    assert any(a.make == "MG" for a in data)


def test_partial_fitment_keeps_unknown_fields_empty():
    d = fixture("fitment_GDB1330")
    v = d["content"][0]["manufacturers"][0]["models"][0]["vehicles"][0]["vehicle"]
    v.update(kw=None, yearOfConstructionTo=None, engineCodes=None)
    vehicle = parse_fitment(d, "GDB1330", "u")[0]
    assert vehicle.power_kw is None and vehicle.year_to is None and vehicle.engine_code is None


def test_alternatives_are_source_interchanges_not_shared_fitment():
    data = parse_details(fixture("details_GDB1330"), "u")
    assert any(r.to.brand == "LEMFÖRDER" and r.to.number == "20553 04"
               and r.relation_type == "MANUFACTURER_INTERCHANGE" for r in data.relationships)


def test_short_and_unknown_numbers_do_not_invent_results():
    http = FakeHttp()
    assert ZfAdapter(http).lookup_foreign(LookupRequest("MG", "123", "oem")).is_empty
    assert http.calls == []
    assert ZfAdapter(http).lookup(LookupRequest("TRW", "ZZZNOCODE900", "aftermarket")).is_empty


def test_restricted_article_is_not_read_through_another_endpoint():
    class Restricted(FakeHttp):
        def fetch_json(self, url, **kwargs):
            d = super().fetch_json(url, **kwargs)
            if "/articles/" in url:
                d["meta"]["isRestricted"] = True
            return d
    http = Restricted()
    with pytest.raises(SourceBlocked):
        ZfAdapter(http).lookup(LookupRequest("TRW", "GDB1330", "aftermarket"))
    assert not any(c[0] == FITMENT_URL for c in http.calls)


def test_result_matches_catalogue_schema():
    result = run_lookup([ZfAdapter(FakeHttp())], LookupRequest("TRW", "GDB1330", "aftermarket"), "test", load_schema())
    assert result.errors == []
    assert result.sources[0]["name"] == "ZF / LEMFÖRDER / SACHS / TRW / BOGE (каталог виробника)"


def test_every_anonymous_api_response_is_archived():
    class Response:
        status_code = 200
        def __init__(self, text):
            self.text = text
    class Session:
        headers = {}
        def request(self, method, url, **kwargs):
            return Response(json.dumps(FakeHttp().fetch_json(url, params=kwargs.get("params"))))
    http = PoliteSession(session=Session(), limiter=RateLimiter(0))
    result = run_lookup([ZfAdapter(http)], LookupRequest("TRW", "GDB1330", "aftermarket"), "test", load_schema())
    assert result.errors == []
    assert len(result.documents) == 3
    assert result.documents[-1]["params"]["articleID"] == "GDB1330"
    assert "manufacturers" in result.documents[-1]["body"]


def test_large_fitment_is_cut_with_an_explicit_notice(monkeypatch):
    import parsers.adapters.zf as module
    monkeypatch.setattr(module, "MAX_APPLICATIONS", 2)
    data = ZfAdapter(FakeHttp()).lookup(LookupRequest("TRW", "GDB1330", "aftermarket"))
    assert len(data.applications) == 2
    assert any(a.name == "Застосовність у каталозі" and "показано 2 з" in a.value for a in data.attributes)


def test_kit_components_are_contains_not_equivalents():
    data = ZfAdapter(FakeHttp()).lookup(LookupRequest("SACHS", "3000951003", "aftermarket"))
    components = [r for r in data.relationships if r.relation_type == "CONTAINS"]
    assert {(r.to.brand, r.to.number) for r in components} == {
        ("SACHS", "3082 000 403"), ("SACHS", "1878 002 205"),
        ("SACHS", "3151 600 743"), ("SACHS", "4200 080 060")}
    assert all(r.direction is None for r in components)
    assert all("products/3000+951+003?country=UA" in r.record_url for r in components)
    assert not any(r.relation_type == "OEM_REFERENCE" for r in data.relationships)
    assert any(r.to.number == "3000 951 603" and r.relation_type == "SUPERSEDED_BY" for r in data.relationships)


def test_included_in_assembly_has_incoming_contains_direction():
    adapter = ZfAdapter(FakeHttp())
    data = fixture("details_3082_000_403")
    # Test just the assembly section, without following a supersession chain.
    data["details"]["replacedBy"] = None
    result = parse_details(data, "u")
    adapter._linked_relations(data, "3082 000 403", "u", result)
    link = next(r for r in result.relationships if r.relation_type == "CONTAINS")
    assert (link.to.brand, link.to.number, link.direction) == ("SACHS", "3000 951 003", "incoming")


def test_sachs_result_with_component_links_matches_schema():
    data = run_lookup([ZfAdapter(FakeHttp())], LookupRequest("SACHS", "3000951003", "aftermarket"), "test", load_schema())
    assert data.errors == []
    assert data.relationships and data.applications
