from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import pytest
from bs4 import BeautifulSoup

from parsers.adapters import LookupRequest
from parsers.adapters.metelli import BRANDS, MetelliAdapter, _safe_url, parse_product, parse_search
from parsers.http import PoliteSession, RateLimiter, SourceError
from parsers.worker import load_schema, run_lookup
from tools.metelli_model_numbers import harvest

FIXTURES = Path(__file__).parent / "fixtures"


def fixture(name):
    return (FIXTURES / f"metelli_{name}.html").read_text(encoding="utf-8")


class FakeHttp:
    def __init__(self, product=None, search=None, vehicles=None):
        self.product, self.search, self.vehicles = product, search, vehicles
        self.calls = []

    def fetch(self, url, method="GET", params=None, form_body=None):
        self.calls.append((url, method, params, form_body))
        action = urlsplit(url).path.rsplit("/", 1)[-1]
        query = {k: v[0] for k, v in parse_qs(urlsplit(url).query).items()}
        query.update(params or {})
        if action == "PartList":
            if method == "POST":
                assert form_body and set(form_body) == {"searchtext"}
                return self.search if self.search is not None else fixture("search")
            return fixture("parts")
        if action == "ProductDetail":
            if self.product is not None:
                return self.product
            key = query["brand"] if query["code"] == "04-1143" else query["code"]
            return fixture("product_" + key)
        if action == "GetVehiclesByMake":
            assert query["make"] == "-1"
            return self.vehicles if self.vehicles is not None else fixture("vehicles").replace("brand=metelli", "brand=" + query["brand"])
        return fixture({"AdvancedSearch": "makes", "VehicleModels": "models", "VehicleVersions": "versions", "ProductFamily": "families"}[action])


def test_own_search_returns_labelled_crosses_and_not_sibling_brands():
    data = MetelliAdapter(FakeHttp()).lookup(LookupRequest("Metelli", "041143", "aftermarket"))
    assert len(data.relationships) == 8
    assert {r.to.brand for r in data.relationships} == {"SKODA", "VOLKSWAGEN", "ABS", "DELPHI", "FEBI", "LPR"}
    assert not any(r.to.brand in BRANDS.values() for r in data.relationships)
    assert data.relationships[0].to.number == "1EA 611 053C"
    assert data.relationships[0].raw_relation_text == "AD. NUMBER: 1EA 611 053C | OE | SKODA"


def test_cifam_visible_number_not_internal_metelli_code():
    http = FakeHttp(search=fixture("search_cifam"))
    data = MetelliAdapter(http).lookup(LookupRequest("Cifam", "101-1143", "aftermarket"))
    assert data.relationships[0].record_ref == "product 101-1143"
    assert "code=04-1143&brand=cifam" in data.relationships[0].record_url
    assert data.attributes[-1].value == "8032747477892"
    assert len(data.applications) == 3


@pytest.mark.parametrize("brand,number", [("Metelli", "101-1143"), ("Cifam", "04-1143"), ("MG", "04-1143"), ("Metelli", "04-114"), ("Metelli", "04-1143A")])
def test_wrong_brand_and_prefix_are_not_own_matches(brand, number):
    assert MetelliAdapter(FakeHttp()).lookup(LookupRequest(brand, number, "aftermarket")).is_empty


def test_foreign_oe_is_explicitly_verified_for_each_own_brand():
    data = MetelliAdapter(FakeHttp(search=fixture("search_oe"))).lookup_foreign(LookupRequest("Skoda", "1EA611053C", "oem"))
    assert {(r.to.brand, r.to.number) for r in data.relationships} == {("Metelli", "04-1143"), ("Cifam", "101-1143"), ("Trusting", "CF1143"), ("Fri.tech.", "CF1143")}
    assert all(r.direction == "incoming" and r.relation_type == "OEM_REFERENCE" for r in data.relationships)


def test_foreign_number_under_another_make_is_rejected():
    data = MetelliAdapter(FakeHttp()).lookup_foreign(LookupRequest("MG", "1EA611053C", "oem"))
    assert data.is_empty


def test_foreign_short_number_does_not_call_source():
    http = FakeHttp()
    assert MetelliAdapter(http).lookup_foreign(LookupRequest("ABS", "4210", "aftermarket")).is_empty
    assert http.calls == []


def test_competitor_cross_is_not_misclassified_as_oe():
    data = MetelliAdapter(FakeHttp()).lookup_foreign(LookupRequest("febi", "185686", "aftermarket"))
    assert len(data.relationships) == 4
    assert all(r.relation_type == "COMPETITOR_REFERENCE" for r in data.relationships)


def test_unlabelled_oe_is_ambiguous_and_never_a_foreign_match():
    soup = BeautifulSoup(fixture("product_metelli"), "html.parser")
    for row in soup.select("#adnumber tbody tr")[:4]:
        row.find_all("td")[3].clear()
    http = FakeHttp(product=str(soup))
    data = MetelliAdapter(http).lookup(LookupRequest("Metelli", "04-1143", "aftermarket"))
    oe = [r for r in data.relationships if r.relation_type == "OEM_REFERENCE"]
    assert len(oe) == 8 and all(r.ambiguous and r.reason for r in oe)
    assert {r.to.brand for r in oe} == {"AUDI", "CUPRA", "SKODA", "VOLKSWAGEN"}
    assert MetelliAdapter(http).lookup_foreign(LookupRequest("Skoda", "1EA611053C", "oem")).is_empty
    # One fitment maker is still not an explicitly labelled foreign OE.
    for option in soup.select("#vehicle option[value]"):
        if str(option["value"]) not in ("0", "-1", "633"):
            option.decompose()
    assert MetelliAdapter(FakeHttp(product=str(soup))).lookup_foreign(LookupRequest("Skoda", "1EA611053C", "oem")).is_empty


def test_unknown_maker_oe_is_retained_without_inventing_a_brand():
    soup = BeautifulSoup(fixture("product_metelli"), "html.parser")
    for row in soup.select("#adnumber tbody tr")[:4]:
        row.find_all("td")[3].clear()
    soup.select_one("#vehicle").decompose()
    product = parse_product(str(soup), "url")
    assert not any(r.relation_type == "OEM_REFERENCE" for r in product.result.relationships)
    assert any(a.value == "1EA 611 053C" and "without maker" in a.name for a in product.result.attributes)


def test_fitment_preserves_condition_row_without_inventing_vehicle_end_year():
    data = MetelliAdapter(FakeHttp()).lookup(LookupRequest("Metelli", "04-1143", "aftermarket"))
    app = data.applications[0]
    assert (app.make, app.model, app.engine_code, app.year_from, app.power_kw) == ("AUDI", "Q4 (F4B) 35 e-tron", "EBJA", 2021, 125)
    assert app.year_to is None and app.position is None
    assert app.constraints == {"conditions": ["Year -06/22, Rear, Brake system Ate"], "displacement_cc": "0"}
    assert "Year -06/22, Rear, Brake system Ate" in app.raw_text


def test_fitment_wrong_brand_or_unknown_make_is_not_guessed():
    data = MetelliAdapter(FakeHttp(vehicles=fixture("vehicles").replace("make=35", "make=999"))).lookup(LookupRequest("Metelli", "04-1143", "aftermarket"))
    assert data.applications == []
    data = MetelliAdapter(FakeHttp(vehicles=fixture("vehicles").replace("brand=metelli", "brand=cifam"))).lookup(LookupRequest("Metelli", "04-1143", "aftermarket"))
    assert data.applications == []


def test_source_own_number_with_spaces_is_preserved_not_cut_at_first_word():
    http = FakeHttp(product=fixture("product_metelli").replace("04-1143", "00 04-1143A"), search=fixture("search").replace("04-1143", "00 04-1143A"))
    data = MetelliAdapter(http).lookup(LookupRequest("Metelli", "00041143A", "aftermarket"))
    assert data.relationships[0].record_ref == "product 00 04-1143A"


def test_trade_number_remains_trade_not_aftermarket():
    body = fixture("product_metelli").replace("<td>ABS</td>", "<td>WVA</td>")
    product = parse_product(body, "url")
    trade = next(r for r in product.result.relationships if r.to.brand == "WVA")
    assert trade.relation_type == "TRADE_NUMBER" and trade.to.number_type == "trade"


def test_product_brand_and_exact_search_label_are_both_verified():
    adapter = MetelliAdapter(FakeHttp(product=fixture("product_metelli").replace("var brand = 'metelli'", "var brand = 'cifam'")))
    assert adapter.lookup(LookupRequest("Metelli", "04-1143", "aftermarket")).is_empty
    adapter = MetelliAdapter(FakeHttp(product=fixture("product_metelli").replace("04-1143 -", "04-114 -")))
    assert adapter.lookup_foreign(LookupRequest("Skoda", "1EA611053C", "oem")).is_empty


def test_missing_product_identity_is_an_error():
    with pytest.raises(SourceError, match="identity"):
        parse_product("<html>Server error</html>", "url")


def test_only_same_host_catalogue_links_are_followed():
    for path in ("https://evil.example/en/Home/ProductDetail", "//evil.example/en/Home/ProductDetail", "/en/MyMetelli/Login", "http://www.metelligroup.it/en/Home/ProductDetail"):
        assert _safe_url(path) is None
    assert parse_search(fixture("search").replace('/en/Home/ProductDetail?', 'https://evil.example/en/Home/ProductDetail?')) == []


def test_lookup_matches_schema_and_archives_all_three_raw_responses():
    fake = FakeHttp()
    class Response:
        status_code = 200
        def __init__(self, body):
            self.text = body
    class Session:
        headers = {}
        def request(self, method, url, **kwargs):
            return Response(fake.fetch(url, method, kwargs.get("params"), kwargs.get("data")))
    http = PoliteSession(session=Session(), limiter=RateLimiter(0))
    result = run_lookup([MetelliAdapter(http)], LookupRequest("Metelli", "04-1143", "aftermarket"), "test", load_schema())
    assert result.errors == [] and len(result.documents) == 3
    assert result.documents[0]["params"]["form"] == {"searchtext": "04-1143"}
    assert result.documents[1]["body"] == fixture("product_metelli")
    assert MetelliAdapter.min_interval >= 5


def test_harvest_selects_one_own_brand_and_follows_the_all_parts_link():
    http = FakeHttp()
    assert list(harvest(http, ["CHERY"], "Metelli", ["Tiggo"], 1, 1)) == ["23-0803C", "53-0439", "53-0439K"]
    assert sum(urlsplit(call[0]).path.endswith("PartList") for call in http.calls) == 1


def test_harvest_limits_are_partial_and_unknown_models_do_not_use_all():
    assert list(harvest(FakeHttp(), ["CHERY"], "Metelli", ["Tiggo"], 1, 1, 1)) == ["23-0803C"]
    assert list(harvest(FakeHttp(), ["CHERY"], "Metelli", ["ZZZNOMODEL"])) == []
    assert list(harvest(FakeHttp(), ["ZZZNOMAKE"], "Metelli")) == []
