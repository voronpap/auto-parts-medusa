from pathlib import Path

import pytest
from bs4 import BeautifulSoup

from parsers.adapters import LookupRequest
from parsers.adapters.geely_ksa import CATALOG_URL, GeelyKsaAdapter, parse_rows
from parsers.http import PoliteSession, RateLimiter, SourceError
from parsers.worker import load_schema, run_lookup
from tools.geely_ksa_model_numbers import harvest

BODY = (Path(__file__).parent / "fixtures/geely_ksa_parts.html").read_text(encoding="utf-8")


class FakeHttp:
    def __init__(self, body=BODY):
        self.body, self.calls = body, []

    def fetch(self, url):
        self.calls.append(url)
        return self.body


def test_shared_number_keeps_each_explicit_model_not_a_cross():
    data = GeelyKsaAdapter(FakeHttp()).lookup(LookupRequest("Geely", "2069-031600", "oem"))
    assert {a.model for a in data.applications} == {"MONJARO", "STARRAY"}
    assert data.relationships == []
    assert {a.value for a in data.attributes} == {"2069031600", "RADIATOR"}


def test_source_numbers_keep_zeros_separators_and_suffixes():
    html = BODY.replace("4048104500", "00 4810-4500A")
    data = GeelyKsaAdapter(FakeHttp(html)).lookup(LookupRequest("Geely", "0048104500A", "oem"))
    assert data.attributes[0].value == "00 4810-4500A"
    assert "00 4810-4500A" in data.applications[0].raw_text


def test_models_join_by_source_id_and_not_dropdown_order():
    soup = BeautifulSoup(BODY, "html.parser")
    selector = soup.select_one("#geelyPartsDataOptions")
    options = list(selector.select("option"))
    for option in options:
        option.extract()
    for option in reversed(options):
        selector.append(option)
    data = GeelyKsaAdapter(FakeHttp(str(soup))).lookup(LookupRequest("Geely", "4048090200", "oem"))
    assert [a.model for a in data.applications] == ["NEW EMGRAND"]


def test_missing_make_model_mapping_is_not_guessed_from_a_heading():
    soup = BeautifulSoup(BODY, "html.parser")
    soup.select_one('option[data-postid="238136"]').decompose()
    assert not any(r.number == "4048104500" for r in parse_rows(str(soup)))


def test_partial_fitment_does_not_invent_year_engine_position_or_market():
    data = GeelyKsaAdapter(FakeHttp()).lookup(LookupRequest("Geely", "4048104500", "oem"))
    app = data.applications[0]
    assert app.make == "Geely" and app.model == "STARRAY"
    assert app.year_from is app.year_to is app.engine is app.position is app.market is None
    assert app.raw_text == "STARRAY | 4048104500 | PAD-FRT BRAKE"


def test_number_under_another_brand_is_not_a_match():
    http = FakeHttp()
    assert GeelyKsaAdapter(http).lookup(LookupRequest("MG", "2069031600", "oem")).is_empty
    assert http.calls == []
    assert not GeelyKsaAdapter.cross_search


@pytest.mark.parametrize("number", ["404810450", "2069031600A", "ZZZNOCODE900", ""])
def test_prefix_suffix_and_unknown_numbers_are_rejected(number):
    assert GeelyKsaAdapter(FakeHttp()).lookup(LookupRequest("Geely", number, "oem")).is_empty


def test_changed_table_layout_is_an_error_not_a_false_match():
    with pytest.raises(SourceError, match="columns"):
        parse_rows(BODY.replace("Part Number", "Different Column"))
    with pytest.raises(SourceError, match="missing"):
        parse_rows("<html>Service unavailable</html>")


def test_no_price_is_misreported_as_a_part_specification():
    data = GeelyKsaAdapter(FakeHttp()).lookup(LookupRequest("Geely", "2069031600", "oem"))
    assert {a.name for a in data.attributes} == {"Part Number", "Description"}


def test_lookup_matches_schema():
    data = run_lookup([GeelyKsaAdapter(FakeHttp())], LookupRequest("Geely", "2069031600", "oem"), "test", load_schema())
    assert data.errors == []
    assert data.sources[0]["name"] == "Geely KSA (каталог виробника)"
    assert data.applications and data.attributes


def test_raw_page_is_archived_without_extra_requests():
    class Response:
        status_code = 200
        text = BODY
    class Session:
        headers = {}
        def request(self, method, url, **kwargs):
            assert method == "GET" and url == CATALOG_URL
            return Response()
    http = PoliteSession(session=Session(), limiter=RateLimiter(0))
    result = run_lookup([GeelyKsaAdapter(http)], LookupRequest("Geely", "2069031600", "oem"), "test", load_schema())
    assert result.errors == [] and len(result.documents) == 1
    assert result.documents[0]["body"] == BODY


def test_harvest_filters_source_model_names_and_deduplicates_numbers():
    http = FakeHttp()
    assert list(harvest(http, ["STARRAY"])) == ["1056025900", "2069031600", "4048104500"]
    assert len(list(harvest(FakeHttp(), ["MONJARO", "STARRAY"]))) == 3
    assert http.calls == [CATALOG_URL]


def test_harvest_unknown_model_does_not_fall_back_to_all_models():
    assert list(harvest(FakeHttp(), ["ZZZNOMODEL"])) == []
    assert GeelyKsaAdapter.min_interval == 20
