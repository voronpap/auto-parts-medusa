import json
from pathlib import Path

import pytest

from parsers.adapters import LookupRequest
from parsers.adapters.ctr import CtrAdapter, DETAIL_URL, SEARCH_URL, parse_detail, search_params, unwrap
from parsers.http import PoliteSession, RateLimiter, SourceBlocked, SourceError
from parsers.worker import load_schema, run_lookup
from tools.ctr_make_numbers import harvest

FIXTURES = Path(__file__).parent / "fixtures"


def fixture(name):
    return json.loads((FIXTURES / f"ctr_{name}.json").read_text(encoding="utf-8"))


class FakeHttp:
    def __init__(self, search=None, detail=None):
        self.search, self.detail = search, detail
        self.calls = []

    def fetch_json(self, url, params=None):
        self.calls.append((url, params))
        if url == SEARCH_URL:
            if self.search is not None:
                return self.search
            if params["searchType"] == "car":
                return fixture("search_harvest")
            return fixture("search_old" if "CBKD" in params["searchKeyword"] or params["searchKeyword"] == "96292010" else "search_haval")
        assert url.startswith(DETAIL_URL + "/")
        return self.detail or fixture("detail_old" if url.endswith("6513290") else "detail_haval")


def test_search_hit_photo_becomes_an_image():
    data = CtrAdapter(FakeHttp()).lookup(LookupRequest("CTR", "CB0672", "aftermarket"))

    assert [image.url for image in data.images] == [
        "https://ctr-cdn2-e7f6e5bugjh6gfc0.z01.azurefd.net/aftermarket/ncu_rus/CB0672_1.jpg"
    ]


def test_own_legacy_identity_does_not_create_a_replacement_claim():
    data = CtrAdapter(FakeHttp()).lookup(LookupRequest("CTR", "CBKD-8", "aftermarket"))
    assert len(data.relationships) == 3 and len(data.applications) == 5
    assert all(r.relation_type == "OEM_REFERENCE" for r in data.relationships)
    assert {r.to.brand for r in data.relationships} == {"DAEWOO", "GM KOREA", "SUZUKI"}
    assert {a.value for a in data.attributes if a.name in ("CTR No", "Article")} == {"CB0172", "CBKD-8"}


def test_technical_oeNo_identifier_is_not_an_oe_reference():
    data = CtrAdapter(FakeHttp()).lookup(LookupRequest("CTR", "CB0672", "aftermarket"))
    assert [r.to.number for r in data.relationships] == ["2904130A-K00"]
    assert all(a.value != "2851219" for a in data.attributes)


def test_haval_oe_keeps_spelling_and_explicit_application_context():
    data = CtrAdapter(FakeHttp()).lookup(LookupRequest("CTR", "CB0672", "aftermarket"))
    cross = data.relationships[0]
    assert cross.to.brand == "HAVAL" and cross.to.number == "2904130A-K00"
    assert "OE: 2904130AK00" in cross.raw_relation_text
    assert not cross.ambiguous and cross.constraints is None


def test_foreign_oe_requires_number_in_both_list_and_make_row():
    data = CtrAdapter(FakeHttp()).lookup_foreign(LookupRequest("Haval", "2904130AK00", "oem"))
    assert len(data.relationships) == 1
    assert data.relationships[0].to.number == "CB0672" and data.relationships[0].direction == "incoming"
    altered = fixture("detail_haval")
    altered["data"]["applicationList"][0]["oeNo"] = "OTHER999"
    assert CtrAdapter(FakeHttp(detail=altered)).lookup_foreign(LookupRequest("Haval", "2904130AK00", "oem")).is_empty
    altered = fixture("detail_haval")
    altered["data"]["oeList"] = []
    assert CtrAdapter(FakeHttp(detail=altered)).lookup_foreign(LookupRequest("Haval", "2904130AK00", "oem")).is_empty


def test_same_oe_under_another_make_is_rejected():
    assert CtrAdapter(FakeHttp()).lookup_foreign(LookupRequest("Chery", "2904130AK00", "oem")).is_empty


def test_unlabelled_oe_for_multiple_makes_is_ambiguous():
    data = fixture("detail_old")["data"]
    for app in data["applicationList"]:
        app["oeNo"] = None
    result = parse_detail(data, "url")
    assert len(result.relationships) == 3
    assert all(r.ambiguous and r.reason for r in result.relationships)
    assert CtrAdapter(FakeHttp(detail={"statusCode": 200, "data": data})).lookup_foreign(LookupRequest("Daewoo", "96292010", "oem")).is_empty


def test_oe_without_any_make_is_retained_as_attribute():
    data = fixture("detail_haval")["data"]
    data["applicationList"] = []
    result = parse_detail(data, "url")
    assert not result.relationships
    assert any(a.value == "2904130A-K00" and a.name == "OE without maker" for a in result.attributes)


def test_partial_application_does_not_invent_end_year_engine_or_market():
    data = CtrAdapter(FakeHttp()).lookup(LookupRequest("CTR", "CB0672", "aftermarket"))
    app = data.applications[0]
    assert (app.make, app.model, app.year_from, app.position) == ("HAVAL", "Haval 3", 2005, "FRONT AXLE UPPER")
    assert app.year_to is app.engine is app.market is None
    assert "yearFrom: 2005" in app.raw_text


def test_attribute_units_and_status_are_not_guessed():
    data = CtrAdapter(FakeHttp()).lookup(LookupRequest("CTR", "CB0672", "aftermarket"))
    weight = next(a for a in data.attributes if a.name == "weight")
    assert weight.value == "610" and weight.unit is None
    assert any(a.name == "status" and a.value == "01" for a in data.attributes)


@pytest.mark.parametrize("number", ["CB067", "CB0672A", "ZZZNOCODE9", ""])
def test_fuzzy_or_unknown_own_number_is_not_a_match(number):
    assert CtrAdapter(FakeHttp()).lookup(LookupRequest("CTR", number, "aftermarket")).is_empty


def test_unsupported_own_brand_and_short_foreign_do_not_contact_source():
    http = FakeHttp()
    adapter = CtrAdapter(http)
    assert adapter.lookup(LookupRequest("MG", "CB0672", "aftermarket")).is_empty
    assert adapter.lookup_foreign(LookupRequest("Haval", "1234", "oem")).is_empty
    assert http.calls == []


def test_mismatched_detail_identity_is_rejected():
    altered = fixture("detail_haval")
    altered["data"]["ctrno"] = "CBOTHER9"
    adapter = CtrAdapter(FakeHttp(detail=altered))
    assert adapter.lookup(LookupRequest("CTR", "CB0672", "aftermarket")).is_empty
    assert adapter.lookup_foreign(LookupRequest("Haval", "2904130AK00", "oem")).is_empty


def test_source_numbers_keep_zeros_spaces_and_suffixes():
    search, detail = fixture("search_haval"), fixture("detail_haval")
    search["data"]["list"][0]["ctrNo"] = "00 CB-0672A"
    detail["data"]["ctrno"] = "00 CB-0672A"
    adapter = CtrAdapter(FakeHttp(search, detail))
    incoming = adapter.lookup_foreign(LookupRequest("Haval", "2904130AK00", "oem"))
    assert incoming.relationships[0].to.number == "00 CB-0672A"


def test_security_query_stops_without_posting_a_solution():
    http = FakeHttp({"statusCode": 200, "data": {"list": [], "cnt": -1, "str": "challenge"}})
    with pytest.raises(SourceBlocked, match="security query"):
        CtrAdapter(http).lookup(LookupRequest("CTR", "CB0672", "aftermarket"))
    assert len(http.calls) == 1
    with pytest.raises(SourceBlocked):
        unwrap({"statusCode": 401, "data": {}})


def test_invalid_layout_is_an_error_not_a_false_empty_catalogue():
    with pytest.raises(SourceError):
        unwrap({"statusCode": 200, "data": None})
    with pytest.raises(SourceError, match="list"):
        list(CtrAdapter(FakeHttp({"statusCode": 200, "data": {"cnt": 0}})).search("CB0672"))


def test_pagination_uses_source_offsets_and_stops_on_duplicate_page():
    search = fixture("search_haval")
    search["data"]["cnt"] = 17
    http = FakeHttp(search)
    assert len(list(CtrAdapter(http).search("CB0672"))) == 1
    assert [p["startRow"] for _, p in http.calls] == [0, 8]


def test_pairs_and_related_sets_do_not_become_interchanges():
    data = fixture("detail_haval")["data"]
    data["pairList"] = [{"ctrNo": "FAKEPAIR9"}]
    result = parse_detail(data, "url")
    assert not any(r.to.number == "FAKEPAIR9" for r in result.relationships)
    assert any(a.name == "Source pairList" for a in result.attributes)


def test_lookup_matches_schema_and_archives_unmodified_json():
    fake = FakeHttp()
    class Response:
        status_code = 200
        def __init__(self, body):
            self.text = json.dumps(body)
    class Session:
        headers = {}
        def request(self, method, url, **kwargs):
            assert method == "GET"
            return Response(fake.fetch_json(url, kwargs.get("params")))
    http = PoliteSession(session=Session(), limiter=RateLimiter(0))
    data = run_lookup([CtrAdapter(http)], LookupRequest("CTR", "CB0672", "aftermarket"), "test", load_schema())
    assert data.errors == [] and len(data.documents) == 2
    assert json.loads(data.documents[1]["body"]) == fixture("detail_haval")
    assert CtrAdapter.min_interval >= 5


def test_harvest_requires_explicit_fitment_and_not_just_search_hit():
    search = fixture("search_harvest")
    search["data"]["list"] = [search["data"]["list"][1]]
    assert list(harvest(FakeHttp(search), ["HAVAL"], 1)) == ["CB0672"]
    assert list(harvest(FakeHttp(search), ["CHERY"], 1)) == []
    assert list(harvest(FakeHttp(search), ["HAVAL"], 1, 1)) == ["CB0672"]
