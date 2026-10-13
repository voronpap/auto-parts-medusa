from __future__ import annotations

from pathlib import Path

import pytest
from bs4 import BeautifulSoup

from parsers.adapters import LookupRequest
from parsers.adapters.nibk import CATALOG_URL, NibkAdapter, parse_product_page
from parsers.http import PoliteSession, RateLimiter, ResponseCache
from parsers.worker import load_schema, run_lookup

FIXTURES = Path(__file__).parent / "fixtures"


def page(number):
    return (FIXTURES / f"nibk_{number}.html").read_text(encoding="utf-8")


class FakeHttp:
    def __init__(self):
        self.calls = []

    def fetch(self, url, method="GET", form_body=None, **kwargs):
        self.calls.append((method, url, form_body))
        return page(form_body["txtPartNo"]) if form_body else page(url.rsplit("/", 1)[-1])


def test_geely_oe_numbers_are_explicit_maker_references():
    adapter = NibkAdapter(FakeHttp())
    result = adapter.lookup(LookupRequest("NiBK", "PN8056", "aftermarket"))
    assert [(r.to.brand, r.to.number, r.relation_type) for r in result.relationships] == [
        ("GEELY", "4048102700", "OEM_REFERENCE"),
        ("GEELY", "8894490939", "OEM_REFERENCE"),
    ]
    assert result.relationships[0].raw_relation_text == "Cross Reference: GEELY 4048102700"


def test_geely_fitment_keeps_open_dates_and_front_position():
    _, result = parse_product_page(page("PN8056"), "u")
    assert [(a.make, a.model, a.year_from, a.year_to) for a in result.applications] == [
        ("GEELY", "Coolray", 2022, None),
        ("GEELY", "Coolray", 2024, None),
        ("GEELY", "Icon", 2022, None),
    ]
    assert all(a.position == "Front Brake" for a in result.applications)
    assert result.applications[0].body == "SX11-A3"
    assert result.applications[0].engine_code == "BHE15-EFZ"
    assert result.applications[0].engine == "1500 cc"
    assert result.applications[2].body is None
    assert "08.22~" in result.applications[0].raw_text


def test_numbers_keep_spaces_suffixes_and_source_spelling():
    _, result = parse_product_page(page("PN0636"), "u")
    numbers = {r.to.number for r in result.relationships}
    assert {"2580 8929", "68338 497AA", "NAYF-33-28Z", "16 05 145", "D1379-8489"} <= numbers
    assert next(r for r in result.relationships if r.to.number == "D1379-8489").relation_type == "TRADE_NUMBER"


def test_neighbouring_vehicle_parts_never_become_crosses():
    _, result = parse_product_page(page("PN8056"), "u")
    assert not {"PN8057", "RN2309V", "RN2750"} & {r.to.number for r in result.relationships}


def test_foreign_search_confirms_number_under_the_requested_maker():
    adapter = NibkAdapter(FakeHttp())
    found = adapter.lookup_foreign(LookupRequest("Geely", "8894490939", "oem"))
    assert [(r.to.brand, r.to.number, r.direction, r.relation_type) for r in found.relationships] == [
        ("NiBK", "PN8056", "incoming", "OEM_REFERENCE")
    ]
    assert "GEELY 8894490939" in found.relationships[0].raw_relation_text
    assert adapter.lookup_foreign(LookupRequest("Toyota", "8894490939", "oem")).is_empty


def test_short_foreign_number_is_not_requested():
    http = FakeHttp()
    assert NibkAdapter(http).lookup_foreign(LookupRequest("Geely", "123", "oem")).is_empty
    assert http.calls == []


def test_unknown_own_number_is_empty_and_does_not_get_another_product():
    assert NibkAdapter(FakeHttp()).lookup(LookupRequest("NiBK", "ZZZNOCODE900", "aftermarket")).is_empty


def test_detail_returned_for_another_code_is_not_an_own_match():
    class WrongCode(FakeHttp):
        def fetch(self, *args, **kwargs):
            return page("PN8056")

    assert NibkAdapter(WrongCode()).lookup(LookupRequest("NiBK", "PN805", "aftermarket")).is_empty


def test_another_parts_vehicle_row_is_rejected():
    soup = BeautifulSoup(page("PN8056"), "html.parser")
    for link in soup.select(".model-body a.parts"):
        if link.get_text(strip=True) == "PN8056":
            link.string = "PN8057"
    _, result = parse_product_page(str(soup), "u")
    assert result.applications == []
    assert len(result.relationships) == 2


@pytest.mark.parametrize("number", ["PN8056", "PN0636", "PN6049"])
def test_result_matches_exchange_schema(number):
    result = run_lookup([NibkAdapter(FakeHttp())], LookupRequest("NiBK", number, "aftermarket"),
                        "test", load_schema())
    assert result.errors == []
    assert result.sources[0]["name"] == "NiBK / JNBK (каталог виробника)"
    assert result.attributes


def test_form_search_and_cache_keep_raw_response_for_archive(tmp_path):
    class Response:
        status_code = 200
        text = page("PN8056")

    class Session:
        headers = {}

        def __init__(self):
            self.calls = []

        def request(self, method, url, **kwargs):
            self.calls.append((method, url, kwargs))
            return Response()

    network = Session()
    http = PoliteSession(session=network, cache=ResponseCache(tmp_path / "cache.sqlite"),
                         limiter=RateLimiter(0))
    adapter = NibkAdapter(http)
    first = run_lookup([adapter], LookupRequest("NiBK", "PN8056", "aftermarket"), "test", load_schema())
    second = run_lookup([adapter], LookupRequest("NiBK", "PN8056", "aftermarket"), "test", load_schema())
    assert len(network.calls) == 1
    method, url, kwargs = network.calls[0]
    assert (method, url) == ("POST", CATALOG_URL)
    assert kwargs["data"] == {"txtPartNo": "PN8056", "txtClass": "1", "btnProductSearch": "Search"}
    assert first.documents[0]["params"]["form"] == kwargs["data"]
    assert first.documents[0]["body"] == Response.text
    assert first.documents[0]["request_key"] == second.documents[0]["request_key"]
    assert first.documents[0]["fetched_at"] == second.documents[0]["fetched_at"]


def test_json_and_form_bodies_cannot_be_mixed():
    with pytest.raises(ValueError):
        PoliteSession().fetch(CATALOG_URL, method="POST", json_body={}, form_body={})


def test_haval_fitment_does_not_relabel_great_wall_oe_numbers():
    _, result = parse_product_page(page("PN6049"), "u")
    assert {a.make for a in result.applications} == {"HAVAL"}
    oe = [r for r in result.relationships if r.relation_type == "OEM_REFERENCE"]
    assert {r.to.brand for r in oe} == {"GREAT WALL"}
    assert {r.to.number for r in oe} == {"3501151AGW01A", "3501171XGW01A"}


def test_joint_manufacturer_label_retains_each_stated_maker():
    html = page("PN8056").replace('class="owner">GEELY', 'class="owner">HYUNDAI / KIA')
    _, result = parse_product_page(html, "u")
    assert {r.to.brand for r in result.relationships} == {"HYUNDAI", "KIA"}
    assert all(r.relation_type == "OEM_REFERENCE" for r in result.relationships)
