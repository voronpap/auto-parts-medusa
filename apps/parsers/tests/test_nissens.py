from pathlib import Path

import pytest
from bs4 import BeautifulSoup

from parsers.adapters import LookupRequest
from parsers.adapters.nissens import CATALOG_URL, DETAIL_URL, NissensAdapter, parse_details, parse_search
from parsers.http import PoliteSession, RateLimiter
from parsers.worker import load_schema, run_lookup

FIXTURES = Path(__file__).parent / "fixtures"


def fixture(name):
    return (FIXTURES / f"nissens_{name}.html").read_text(encoding="utf-8")


class FakeHttp:
    def __init__(self):
        self.calls = []

    def fetch(self, url, method="GET", form_body=None, **kwargs):
        self.calls.append((method, url, form_body))
        if url == CATALOG_URL:
            return fixture("form")
        if url == DETAIL_URL:
            return fixture(f"details_{form_body['productID']}")
        number = form_body.get("SearchParameters.NissensNumber") or form_body.get("SearchParameters.OeNumber")
        return fixture(f"search_{number}")


def test_only_requested_product_is_collected_from_the_vehicle_table():
    http = FakeHttp()
    result = NissensAdapter(http).lookup(LookupRequest("Nissens", "607401", "aftermarket"))
    assert [(r.to.brand, r.to.number) for r in result.relationships] == [("MG", "10792284")]
    assert len(result.applications) == 1
    details = [call for call in http.calls if call[1] == DETAIL_URL]
    assert len(details) == 1
    assert details[0][2]["productID"] == "607401"
    assert "941518" not in {r.to.number for r in result.relationships}


def test_vehicle_row_keeps_engine_power_dates_and_transmission():
    result = NissensAdapter(FakeHttp()).lookup(LookupRequest("Nissens", "607401", "aftermarket"))
    vehicle = result.applications[0]
    assert (vehicle.make, vehicle.model, vehicle.engine, vehicle.engine_code) == (
        "MG", "HS (2019)", "1.5 T-GDI", "15E4E")
    assert (vehicle.power_kw, vehicle.year_from, vehicle.year_to) == (119, 2018, None)
    assert (vehicle.fuel, vehicle.transmission) == ("Petrol", "MAN/AUT")
    assert "9/2018 ->" in vehicle.raw_text


def test_specifications_are_not_given_invented_units_or_values():
    _, make, data = parse_details(fixture("details_607401"), "u")
    assert make == "MG"
    attrs = {a.name: a.value for a in data.attributes}
    assert attrs["Product size (H x W x T)"] == "680 x 350 x 16 mm"
    assert attrs["Gross weight"] == "3.10 kg"
    assert attrs["EAN"] == "5707286579248"
    assert "Date" not in attrs


def test_oe_spelling_and_hidden_oe_values_are_kept():
    html = fixture("details_607401").replace("10792284", "00 1079-2284A")
    code, _, data = parse_details(html, "u")
    assert code == "607401"
    assert data.relationships[0].to.number == "00 1079-2284A"
    assert data.relationships[0].raw_relation_text == "OE number: 00 1079-2284A"


def test_foreign_oe_is_confirmed_in_details_not_from_the_search_row():
    adapter = NissensAdapter(FakeHttp())
    result = adapter.lookup_foreign(LookupRequest("MG", "10792284", "oem"))
    assert [(r.to.brand, r.to.number, r.direction) for r in result.relationships] == [
        ("Nissens", "607401", "incoming")]


def test_same_number_under_another_brand_is_rejected_before_detail_requests():
    http = FakeHttp()
    result = NissensAdapter(http).lookup_foreign(LookupRequest("Toyota", "10792284", "oem"))
    assert result.is_empty
    assert not any(call[1] == DETAIL_URL for call in http.calls)


def test_search_hit_without_actual_oe_reference_does_not_count():
    class NoReference(FakeHttp):
        def fetch(self, url, **kwargs):
            body = super().fetch(url, **kwargs)
            return body.replace("10792284", "10792285") if url == DETAIL_URL else body
    assert NissensAdapter(NoReference()).lookup_foreign(LookupRequest("MG", "10792284", "oem")).is_empty


def test_detail_for_wrong_product_does_not_become_a_cross():
    class WrongDetail(FakeHttp):
        def fetch(self, url, **kwargs):
            body = super().fetch(url, **kwargs)
            return body.replace("Nissens part number 607401", "Nissens part number 999999") if url == DETAIL_URL else body
    result = NissensAdapter(WrongDetail()).lookup(LookupRequest("Nissens", "607401", "aftermarket"))
    assert result.relationships == []


def test_partial_vehicle_keeps_missing_fields_empty():
    soup = BeautifulSoup(fixture("search_607401"), "html.parser")
    row = soup.select("#checkboxContainer tr")[-1]
    cells = row.find_all("td", recursive=False)
    cells[7].clear()
    cells[9].clear()
    hits, _ = parse_search(str(soup))
    assert hits[0].application.power_kw is None
    assert hits[0].application.year_from is None
    assert hits[0].application.engine_code == "15E4E"


def test_oe_without_maker_is_preserved_without_guessing():
    soup = BeautifulSoup(fixture("details_607401"), "html.parser")
    soup.select_one(".productdetails__header__sub > span").decompose()
    _, make, result = parse_details(str(soup), "u")
    assert make is None
    assert result.relationships == []
    assert "10792284" in {a.value for a in result.attributes}


@pytest.mark.parametrize("number", ["607401", "941518"])
def test_full_result_matches_catalogue_schema(number):
    result = run_lookup([NissensAdapter(FakeHttp())], LookupRequest("Nissens", number, "aftermarket"),
                        "test", load_schema())
    assert result.errors == []
    assert result.sources[0]["name"] == "Nissens (каталог виробника)"
    assert result.applications


def test_unknown_and_short_numbers_do_not_make_fuzzy_crosses():
    http = FakeHttp()
    assert NissensAdapter(http).lookup(LookupRequest("Nissens", "ZZZNOCODE900", "aftermarket")).is_empty
    before = len(http.calls)
    assert NissensAdapter(http).lookup_foreign(LookupRequest("MG", "123", "oem")).is_empty
    assert len(http.calls) == before


def test_search_pagination_follows_source_page_links():
    class Pages(FakeHttp):
        def fetch(self, url, method="GET", form_body=None, **kwargs):
            if url == CATALOG_URL:
                return fixture("form")
            if url == DETAIL_URL:
                return fixture("details_607401")
            self.calls.append((method, url, form_body))
            body = fixture("search_607401")
            if form_body["PageNo"] == "0":
                return body + '<a pageno="1"></a><a pageno="2"></a>'
            return body.replace("13474654", "13474699")
    http = Pages()
    result = NissensAdapter(http).lookup(LookupRequest("Nissens", "607401", "aftermarket"))
    assert len(result.applications) == 2
    assert [call[2]["PageNo"] for call in http.calls] == ["0", "2"]


def test_all_raw_form_responses_are_archived():
    class Response:
        status_code = 200
        def __init__(self, text):
            self.text = text
    class Session:
        headers = {}
        def request(self, method, url, **kwargs):
            body = FakeHttp().fetch(url, method=method, form_body=kwargs.get("data"))
            return Response(body)
    adapter = NissensAdapter(PoliteSession(session=Session(), limiter=RateLimiter(0)))
    result = run_lookup([adapter], LookupRequest("Nissens", "607401", "aftermarket"), "test", load_schema())
    assert len(result.documents) == 3
    assert result.documents[1]["params"]["form"]["SearchParameters.NissensNumber"] == "607401"
    assert result.documents[2]["params"]["form"]["productID"] == "607401"
    assert result.documents[2]["body"] == fixture("details_607401")
