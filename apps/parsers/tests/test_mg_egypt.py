import json
from pathlib import Path

import pytest

from parsers.adapters import ADAPTERS, LookupRequest
from parsers.adapters.mg_egypt import AJAX_URL, CATALOG_URL, MgEgyptAdapter, bootstrap, parse_rows
from parsers.http import PoliteSession, RateLimiter, SourceBlocked, SourceError
from parsers.worker import load_schema, run_lookup
from tools.mg_egypt_model_numbers import harvest

FIXTURES = Path(__file__).parent / "fixtures"


def fixture(name):
    return (FIXTURES / ("mg_egypt_" + name + ".html")).read_text(encoding="utf-8")


class FakeHttp:
    def __init__(self, page=None, parts=None, count=24):
        self.page, self.parts, self.count = page, parts, count
        self.calls = []

    def fetch(self, url, **kwargs):
        self.calls.append((url, kwargs))
        if url == CATALOG_URL:
            return self.page or fixture("bootstrap")
        assert url == AJAX_URL and kwargs["method"] == "POST"
        assert kwargs["form_body"]["action"] == "get_products_ajax"
        assert kwargs["form_body"]["fn_action"] == "filter"
        return self.parts or fixture("parts")

    def fetch_json(self, url, **kwargs):
        self.calls.append((url, kwargs))
        assert url == AJAX_URL and kwargs["method"] == "POST"
        assert kwargs["form_body"]["action"] == "get_products_ajax_count"
        return self.count


def test_own_hs_brake_number_retains_prefix_title_and_exact_years():
    result = MgEgyptAdapter(FakeHttp()).lookup(LookupRequest("MG", "MG10767908", "oem"))
    assert len(result.applications) == 2 and len(result.attributes) == 3
    assert {(a.model, a.year_from, a.year_to) for a in result.applications} == {("MG HS", 2021, 2021), ("MG HS", 2022, 2022)}
    assert any(a.name == "Part Number" and a.value == "MG10767908" for a in result.attributes)
    assert any(a.value == "Font Brake Pad" for a in result.attributes)  # source typo, not silently corrected
    assert all("Part No. MG10767908" in a.raw_text and a.record_ref and a.record_url for a in result.applications)


def test_product_photo_is_taken_from_the_exact_sku_card():
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(fixture("parts"), "html.parser")
    card = soup.select_one("#product_4676_block")
    image = soup.new_tag("img")
    image["src"] = "data:image/svg+xml,placeholder"
    image["data-lazy-src"] = (
        "https://www.mgmotor.com.eg/wp-content/uploads/2023/01/"
        "MG10427930-MG-RX5-2021-thumb.jpg"
    )
    image_block = soup.new_tag("div", attrs={"class": "img"})
    image_block.append(image)
    card.insert(0, image_block)

    result = MgEgyptAdapter(FakeHttp(parts=str(soup))).lookup(
        LookupRequest("MG", "MG10427930", "oem")
    )

    assert [image.url for image in result.images] == [
        "https://www.mgmotor.com.eg/wp-content/uploads/2023/01/"
        "MG10427930-MG-RX5-2021-thumb.jpg"
    ]


def test_product_photo_rejects_wrong_sku_and_untrusted_image_urls():
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(fixture("parts"), "html.parser")
    card = soup.select_one("#product_4676_block")
    image = soup.new_tag("img")
    image["data-lazy-src"] = (
        "https://www.mgmotor.com.eg/wp-content/uploads/2023/01/"
        "MG10427931-MG-RX5-2021-thumb.jpg"
    )
    image_block = soup.new_tag("div", attrs={"class": "img"})
    image_block.append(image)
    card.insert(0, image_block)

    result = MgEgyptAdapter(FakeHttp(parts=str(soup))).lookup(
        LookupRequest("MG", "MG10427930", "oem")
    )

    assert result.images == []


def test_zs_brake_rows_preserve_each_published_year():
    result = MgEgyptAdapter(FakeHttp()).lookup(LookupRequest("MG", "MG10343249", "oem"))
    assert len(result.applications) == 4
    assert {a.year_from for a in result.applications} == {2019, 2020, 2021, 2022}


def test_one_own_number_can_have_multiple_explicit_models_without_crosses():
    result = MgEgyptAdapter(FakeHttp()).lookup(LookupRequest("MG", "MG10427930", "oem"))
    assert len(result.applications) == 10
    assert {a.model for a in result.applications} == {"MG RX5", "MG HS", "MG 6"}
    assert result.relationships == [] and not MgEgyptAdapter.cross_search


def test_oil_filter_alphanumeric_prefix_is_not_stripped():
    result = MgEgyptAdapter(FakeHttp()).lookup(LookupRequest("MG", "MGLPW100180", "oem"))
    assert any(a.name == "Part Number" and a.value == "MGLPW100180" for a in result.attributes)
    assert MgEgyptAdapter(FakeHttp()).lookup(LookupRequest("MG", "LPW100180", "oem")).is_empty


@pytest.mark.parametrize("number", ["10767908", "MG107679", "MG10767908A", "MG99999999"])
def test_prefixless_partial_or_suffixed_number_is_not_a_match(number):
    assert MgEgyptAdapter(FakeHttp()).lookup(LookupRequest("MG", number, "oem")).is_empty


def test_zeroes_spaces_and_suffixes_are_reported_as_source_wrote_them():
    parts = fixture("parts").replace("MG10767908", "MG 0010767908A")
    result = MgEgyptAdapter(FakeHttp(parts=parts)).lookup(LookupRequest("MG", "MG0010767908A", "oem"))
    assert any(a.name == "Part Number" and a.value == "MG 0010767908A" for a in result.attributes)


def test_other_brand_blank_number_and_foreign_search_never_contact_source():
    http = FakeHttp()
    adapter = MgEgyptAdapter(http)
    assert adapter.lookup(LookupRequest("Chery", "MG10767908", "oem")).is_empty
    assert adapter.lookup(LookupRequest("MG", "", "oem")).is_empty
    assert adapter.lookup_foreign(LookupRequest("MG", "MG10767908", "oem")).is_empty
    assert http.calls == []


def test_merchandise_prices_and_units_are_not_catalogue_attributes():
    rows = parse_rows(fixture("parts"), 24)
    assert len(rows) == 23
    assert not any(r.title == "Laptop Bag" for r in rows)
    result = MgEgyptAdapter(FakeHttp()).lookup(LookupRequest("MG", "MG10767908", "oem"))
    assert {a.name for a in result.attributes} == {"Part Number", "Description", "Category"}
    assert all(a.unit is None for a in result.attributes)


def test_partial_application_and_regional_page_do_not_invent_variants():
    parts = fixture("parts").replace("MG HS - 2021/Brakes", "MG HS/Brakes")
    result = MgEgyptAdapter(FakeHttp(parts=parts)).lookup(LookupRequest("MG", "MG10767908", "oem"))
    first = result.applications[0]
    assert first.make == "MG" and first.model == "MG HS"
    assert first.year_from is first.year_to is first.engine is first.market is first.position is None
    parts = fixture("parts").replace("MG HS - 2021/Brakes", "MG HS - /Brakes")
    first = MgEgyptAdapter(FakeHttp(parts=parts)).lookup(LookupRequest("MG", "MG10767908", "oem")).applications[0]
    assert first.model == "MG HS" and first.year_from is first.year_to is None


def test_cumulative_final_page_is_computed_from_count_and_native_size():
    page = fixture("bootstrap").replace('data-count="24"', 'data-count="3"')
    http = FakeHttp(page=page)
    assert len(MgEgyptAdapter(http).rows()) == 23
    form = http.calls[-1][1]["form_body"]
    assert form["page"] == "8" and form["count"] == "3" and form["fn_action"] == "filter"
    assert len(http.calls) == 3


@pytest.mark.parametrize("count", [-1, True, "24", None, 5001])
def test_invalid_or_oversized_total_is_not_treated_as_an_empty_catalogue(count):
    http = FakeHttp(count=count)
    with pytest.raises(SourceError, match="count"):
        MgEgyptAdapter(http).rows()
    assert len(http.calls) == 2


def test_zero_count_is_explicit_empty_and_skips_list_fetch():
    http = FakeHttp(count=0)
    assert MgEgyptAdapter(http).rows() == []
    assert len(http.calls) == 2


def test_missing_or_duplicate_cards_fail_closed_instead_of_false_full_result():
    with pytest.raises(SourceError, match="incomplete"):
        parse_rows(fixture("parts"), 25)
    parts = fixture("parts").replace("product_3846_block", "product_3845_block")
    with pytest.raises(SourceError, match="duplicate"):
        parse_rows(parts, 24)


def test_numbered_part_without_fitment_is_not_silently_omitted():
    parts = fixture("parts").replace("MG HS - 2021/Brakes", "")
    with pytest.raises(SourceError, match="incomplete identity"):
        parse_rows(parts, 24)


def test_changed_model_make_or_number_label_is_rejected():
    with pytest.raises(SourceError, match="label"):
        parse_rows(fixture("parts").replace("MG HS - 2021", "CHERY Tiggo - 2021"), 24)
    with pytest.raises(SourceError, match="label"):
        parse_rows(fixture("parts").replace("Part No.", "Unknown Ref"), 24)


@pytest.mark.parametrize("year", ["1880", "99999", "unknown"])
def test_invalid_year_does_not_become_a_guessed_model_suffix(year):
    with pytest.raises(SourceError, match="year"):
        parse_rows(fixture("parts").replace("MG HS - 2021", "MG HS - " + year), 24)


def test_catalogue_identity_and_action_cannot_redirect_reads_elsewhere():
    with pytest.raises(SourceError, match="identity"):
        bootstrap(fixture("bootstrap").replace("MG Motors in Egypt", "Another Site"))
    with pytest.raises(SourceError, match="action"):
        bootstrap(fixture("bootstrap").replace(AJAX_URL, "https://example.invalid/login"))


def test_model_category_harvest_uses_explicit_rows_and_deduplicates_codes():
    assert set(harvest(FakeHttp(), ["MG HS"], ["Brakes", "Electrical"])) == {"MG10767908", "MG10427930"}
    assert list(harvest(FakeHttp(), ["MG ZS"], ["Brakes"])) == ["MG10343249"]
    assert list(harvest(FakeHttp(), ["Chery Tiggo"], ["Brakes"])) == []


def test_schema_and_unmodified_raw_responses_include_both_form_actions():
    fake = FakeHttp()
    class Response:
        status_code = 200
        def __init__(self, text):
            self.text = text
    class Session:
        headers = {}
        def request(self, method, url, **kwargs):
            data = kwargs.get("data")
            if data and data["action"] == "get_products_ajax_count":
                return Response(json.dumps(fake.fetch_json(url, method=method, form_body=data)))
            return Response(fake.fetch(url, method=method, form_body=data))
    http = PoliteSession(session=Session(), limiter=RateLimiter(0))
    result = run_lookup([MgEgyptAdapter(http)], LookupRequest("MG", "MG10767908", "oem"), "test", load_schema())
    assert result.errors == [] and len(result.documents) == 3
    assert result.documents[2]["body"] == fixture("parts")
    assert [d["params"]["form"]["action"] for d in result.documents[1:]] == ["get_products_ajax_count", "get_products_ajax"]
    assert MgEgyptAdapter in ADAPTERS and MgEgyptAdapter.min_interval >= 5


def test_source_refusal_stops_without_other_actions():
    class Blocked(FakeHttp):
        def fetch(self, url, **kwargs):
            self.calls.append((url, kwargs))
            raise SourceBlocked("HTTP 403")
    http = Blocked()
    with pytest.raises(SourceBlocked):
        MgEgyptAdapter(http).lookup(LookupRequest("MG", "MG10767908", "oem"))
    assert len(http.calls) == 1
