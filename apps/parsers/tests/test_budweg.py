"""Saved real first-page DOM, plus explicitly synthetic paging/error cases.

Synthetic end markers exercise the parser; they are not evidence that live
Budweg pagination is complete or currently healthy.
"""
import html
import json
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import parse_qs, urlencode, urlsplit

import pytest
from bs4 import BeautifulSoup

from parsers.adapters import LookupRequest
from parsers.adapters.budweg import (PRODUCT_URL, BudwegAdapter, add_attribute,
                                    parse_application, parse_product, product_number)
from parsers.http import PoliteSession, RateLimiter, SourceBlocked, SourceError
from parsers.models import SourceResult
from parsers.worker import load_schema, run_lookup


def saved(code):
    return json.loads((Path(__file__).parent / "fixtures" / f"budweg_{code}.json").read_text(encoding="utf-8"))


def document(code, end_markers=True):
    data = saved(code)
    result = "<title>" + html.escape(data["page_title"]) + "</title>" + data["product_html"]
    for field in ("make", "fuel"):
        name = "brand" if field == "make" else "fuel"
        options = "".join('<option value="' + html.escape(x["value"], quote=True) + '">' + html.escape(x["label"]) + '</option>' for x in data[field + "_options"])
        result += f'<select name="{name}">{options}</select>'
    soup = BeautifulSoup(result, "html.parser")
    if end_markers:
        for element in soup.select(".pagination"):
            element.decompose()
    return str(soup)


class Http:
    def __init__(self, pages=None):
        self.pages = pages or {}
        self.calls = []

    def fetch(self, url, **kwargs):
        self.calls.append((url, kwargs))
        if url in self.pages:
            value = self.pages[url]
            if isinstance(value, Exception):
                raise value
            return value
        assert url == PRODUCT_URL
        number = kwargs["params"]["article"]
        return self.pages[number] if number in self.pages else document(number)


def lookup(code="343640", http=None, skip=False):
    adapter = BudwegAdapter(http or Http())
    adapter.skip_fitment = skip
    return adapter.lookup(LookupRequest("Budweg Caliper", code, "aftermarket"))


def paging(first, article, tab="mtab5", slug="compatible-applications", page=1, next_page=2):
    soup = BeautifulSoup(first, "html.parser")
    holder = soup.select_one("." + tab + " .table-rows")
    for old in holder.select(".pagination"):
        old.decompose()
    url = f"https://budweg-catalog.com/product/page/{next_page}/?" + urlencode({"product-tab": slug, "article": article})
    holder.append(BeautifulSoup(f'<div class="pagination"><span class="page-numbers current">{page}</span>' + (f'<a class="next page-numbers" href="{html.escape(url)}">Next</a>' if next_page else '') + '</div>', "html.parser"))
    return str(soup), url


def labelled_row(make="MG", model="ZS", model_code="160", year="2001", date="3/2001 - 8/2005 - VIN > 123"):
    query = {"search": "", "brand": make, "model": model, "engine": "1.8", "fromYear": year, "fuel": "B", "model_code": model_code}
    text = f"{make} {model} {model_code}  Hatchback 1.8 B {date}"
    url = "https://budweg-catalog.com/catalogue/?" + urlencode(query)
    return BeautifulSoup(f'<div class="table-row"><a href="{html.escape(url)}">{html.escape(text)}</a></div>', "html.parser").select_one(".table-row"), query


def one_row_page(base, row, tab="mtab5"):
    soup = BeautifulSoup(base, "html.parser")
    holder = soup.select_one("." + tab + " .table-rows")
    holder.clear()
    holder.append(row)
    return str(soup)


def test_real_caliper_oe_are_ambiguous_not_claimed_fiat():
    result = lookup()
    oe = [r for r in result.relationships if r.relation_type == "OEM_REFERENCE"]
    assert len(oe) == 30 and all(r.ambiguous for r in oe)
    assert {r.to.brand for r in oe} == {"ABARTH"}  # Synthetic one-page case only.
    assert not any(r.to.brand == "Fiat" for r in result.relationships)
    assert oe[0].to.number == "51840582" and "does not name" in oe[0].reason
    assert all(r.record_ref and r.record_url and r.raw_relation_text for r in result.relationships)


@pytest.mark.parametrize("code,gtin", [("343640", "5705444223682"), ("203427", "5705444223644"), ("233411", "5705444031645")])
def test_item_ean_is_not_an_oe_number(code, gtin):
    result = lookup(code)
    source_ean = next(x.value for x in result.attributes if x.name == "EAN Code")
    assert source_ean == gtin
    assert [(r.to.number_type, r.to.number) for r in result.relationships if r.relation_type == "GTIN_IDENTIFIER"] == [("gtin", source_ean)]


def test_service_parts_and_compatible_calipers_are_not_analogues_or_guessed_kit_contents():
    result = lookup("203427")
    assert {r.relation_type for r in result.relationships} == {"GTIN_IDENTIFIER"}
    assert [x.value for x in result.attributes if x.name.startswith("Compatible calipers")] == ["343640", "343641", "344254", "344255"]
    assert [x.value for x in result.attributes if x.name.startswith("Partlist")] == ["0 ()"]
    assert not any(r.to.number == "0" for r in result.relationships)


def test_caliper_fitment_uses_exact_source_labelled_sparepart_caption_binding():
    result = lookup()
    assert len(result.applications) == 10
    app = result.applications[0]
    assert (app.make, app.model, app.body, app.engine, app.fuel, app.year_from, app.year_to) == ("ABARTH", "595", "Hatchback", "1.4", "Petrol", 2016, None)
    assert app.constraints["source_filter"]["model_code"] == "Turismo"
    assert app.constraints["source_vehicle_id"] == "79337"
    assert "article=203427" in app.constraints["source_labelled_vehicle_record"]
    assert app.engine_code is None and app.generation is None and app.quantity is None and app.side is None
    assert app.position == "Behind the axle Rear Left"


def test_model_code_is_not_an_engine_code_or_generation_and_months_are_retained():
    row, fields = labelled_row()
    fields.pop("search")
    app = parse_application(row, fields, parse_product(document("203427"), "203427"), "url", "record")
    assert app.model == "ZS" and app.engine_code is None and app.generation is None
    assert app.year_from == 2001 and app.year_to == 2005
    assert app.constraints["month_from"] == 3 and app.constraints["month_to"] == 8
    assert app.constraints["source_tail"] == "VIN > 123" and "160" in app.raw_text


def test_mapped_caption_does_not_add_unlisted_child_fitments():
    child = BeautifulSoup(document("203427"), "html.parser")
    extra, _ = labelled_row()
    child.select_one(".mtab5 .table-rows").append(extra)
    result = lookup(http=Http({"203427": str(child)}))
    assert len(result.applications) == 10 and {a.make for a in result.applications} == {"ABARTH"}


def test_missing_caption_binding_is_an_error_not_a_guessed_vehicle_split():
    parent = BeautifulSoup(document("343640"), "html.parser")
    parent.select_one(".mtab2 .table-rows").clear()
    with pytest.raises(SourceError, match="lack a unique"):
        lookup(http=Http({"343640": str(parent)}))


def test_conflicting_source_caption_bindings_fail_closed():
    child = BeautifulSoup(document("203427"), "html.parser")
    duplicate = BeautifulSoup(str(child.select_one(".mtab5 .table-row")), "html.parser").select_one(".table-row")
    link = duplicate.select_one("a")
    params = parse_qs(urlsplit(link["href"]).query, keep_blank_values=True)
    params["model"] = ["Wrong Model"]
    link["href"] = "https://budweg-catalog.com/catalogue/?" + urlencode({k: v[0] for k, v in params.items()})
    child.select_one(".mtab5 .table-rows").append(duplicate)
    with pytest.raises(SourceError, match="conflicting"):
        lookup(http=Http({"203427": str(child)}))


def test_native_paging_reads_second_page_before_assigning_ambiguous_oe_namespaces():
    own_first, own_next = paging(document("343640"), "343640")
    child_first, child_next = paging(document("203427"), "203427")
    typed, _ = labelled_row()
    child_second = one_row_page(document("203427"), typed)
    child_second, _ = paging(child_second, "203427", page=2, next_page=None)
    own = BeautifulSoup(str(typed), "html.parser").select_one(".table-row")
    own.select_one("a")["href"] = "?article=343640&car=90000"
    own_second = one_row_page(document("343640"), own)
    own_second, _ = paging(own_second, "343640", page=2, next_page=None)
    http = Http({"343640": own_first, own_next: own_second, "203427": child_first, child_next: child_second})
    result = lookup(http=http)
    assert len(result.applications) == 11
    assert {r.to.brand for r in result.relationships if r.relation_type == "OEM_REFERENCE"} == {"ABARTH", "MG"}
    assert len([r for r in result.relationships if r.relation_type == "OEM_REFERENCE"]) == 60
    assert all(r.ambiguous for r in result.relationships if r.relation_type == "OEM_REFERENCE")
    assert any(url == own_next for url, _ in http.calls) and any(url == child_next for url, _ in http.calls)


@pytest.mark.parametrize("replacement", ["https://other.example/product/page/2/?article=343640&product-tab=compatible-applications", "https://budweg-catalog.com/product/page/3/?article=343640&product-tab=compatible-applications", "https://budweg-catalog.com/product/page/2/?article=WRONG&product-tab=compatible-applications", "https://budweg-catalog.com/product/page/2/?article=343640&product-tab=compatible-caliper"])
def test_hostile_or_wrong_pagination_is_never_followed(replacement):
    page, _ = paging(document("343640"), "343640")
    soup = BeautifulSoup(page, "html.parser")
    soup.select_one(".mtab5 a.next")["href"] = replacement
    http = Http({"343640": str(soup)})
    with pytest.raises(SourceError):
        lookup(http=http)
    assert len(http.calls) == 1


def test_http_500_on_next_page_is_not_partial_success():
    page, next_url = paging(document("343640"), "343640")
    http = Http({"343640": page, next_url: SourceError("HTTP 500")})
    with pytest.raises(SourceError, match="HTTP 500"):
        lookup(http=http)
    assert len(http.calls) == 2


def test_skip_fitment_still_reads_all_oe_namespace_pages_without_caption_enrichment():
    page, next_url = paging(document("343640"), "343640")
    second = BeautifulSoup(document("343640"), "html.parser")
    holder = second.select_one(".mtab5 .table-rows")
    holder.clear()
    holder.append(BeautifulSoup('<div class="table-row"><a href="?article=343640&car=90000">MG ZS 160  Hatchback 1.8 B 3/2001 - 8/2005 - </a></div>', "html.parser"))
    second, _ = paging(str(second), "343640", page=2, next_page=None)
    http = Http({"343640": page, next_url: second})
    result = lookup(http=http, skip=True)
    assert result.applications == []
    assert {r.to.brand for r in result.relationships if r.relation_type == "OEM_REFERENCE"} == {"ABARTH", "MG"}
    assert len(http.calls) == 2


def test_wrong_brand_and_foreign_number_do_not_issue_requests():
    http = Http()
    adapter = BudwegAdapter(http)
    assert adapter.lookup(LookupRequest("Fiat", "343640", "oem")).is_empty
    assert adapter.lookup_foreign(LookupRequest("Fiat", "51840582", "oem")).is_empty
    assert http.calls == [] and not adapter.cross_search


def test_identify_is_one_native_request_without_detail_or_fitment_followup():
    http = Http()
    assert BudwegAdapter(http).identify("343640") == [{"brand": "Budweg Caliper", "number": "343640", "title": "Brake caliper"}]
    assert len(http.calls) == 1


@pytest.mark.parametrize("expected", ["999999", "343640A", "0343640"])
def test_wrong_visible_sku_suffix_or_leading_zero_is_not_an_identity_match(expected):
    with pytest.raises(SourceError, match="identity"):
        parse_product(document("343640"), expected)


def test_placeholder_invalid_number_and_hostile_product_link_are_not_owned_parts():
    http = Http()
    adapter = BudwegAdapter(http)
    assert adapter.identify("0") == [] and adapter.lookup(LookupRequest("Budweg", "0", "aftermarket")).is_empty
    assert http.calls == []
    link = BeautifulSoup('<a href="https://other.example/product/?article=343640">343640</a>', "html.parser").a
    with pytest.raises(SourceError, match="leaves"):
        product_number(link)


def test_literal_oe_spacing_zero_and_suffix_are_not_normalized():
    soup = BeautifulSoup(document("343640"), "html.parser")
    soup.select_one(".mtab4 .table-row").string = " 00 735-483661 A "
    result = lookup(http=Http({"343640": str(soup)}), skip=True)
    assert result.relationships[1].to.number == "00 735-483661 A"


def test_long_literal_attribute_is_reconstructable_without_truncation():
    result = SourceResult()
    value = "literal source text " * 200
    add_attribute(result, "Details", value, value)
    assert "".join(x.value for x in result.attributes) == value
    assert all(len(x.value) <= 500 and len(x.raw_text) <= 2000 for x in result.attributes)


@pytest.mark.parametrize("field,value", [("model", "Wrong"), ("fromYear", "2002"), ("engine", "2.0"), ("fuel", "D")])
def test_printed_application_and_labelled_filter_must_agree(field, value):
    row, fields = labelled_row()
    fields.pop("search")
    fields[field] = value
    with pytest.raises(SourceError, match="conflicts"):
        parse_application(row, fields, parse_product(document("203427"), "203427"), "url", "record")


def test_refusal_is_not_retried_or_replaced_with_another_channel():
    http = Http({PRODUCT_URL: SourceBlocked("HTTP 403")})
    with pytest.raises(SourceBlocked):
        lookup(http=http)
    assert len(http.calls) == 1


@pytest.mark.parametrize("code", ["343640", "203427", "233411"])
def test_first_page_fixture_schema_with_synthetic_end_markers(code):
    result = run_lookup([BudwegAdapter(Http())], LookupRequest("Budweg Caliper", code, "aftermarket"), "fixture-check", load_schema())
    assert result.errors == [] and result.sources[0]["key"] == "budweg"


def test_unregistered_adapter_is_not_claimed_live_ready():
    from parsers.adapters import ADAPTERS
    assert BudwegAdapter not in ADAPTERS


def test_real_piston_platform_annotation_is_retained_without_guessing_generation():
    app = lookup("233411").applications[0]
    assert (app.make, app.model, app.body, app.year_from, app.year_to) == ("ALFA ROMEO", "145", "Hatchback", 1996, 1998)
    assert app.constraints["source_vehicle_annotations"] == ["(930_)"]
    assert app.generation is None and app.engine_code is None


def test_gtin_leading_zeros_and_source_units_survive():
    soup = BeautifulSoup(document("203427"), "html.parser")
    for row in soup.select(".product-table tr"):
        if row.find_all("td")[0].get_text(strip=True) == "EAN Code":
            row.find_all("td")[1].string = "0005705444223644"
    result = lookup("203427", Http({"203427": str(soup)}))
    assert result.relationships[0].to.number == "0005705444223644"
    diameter = next(x for x in result.attributes if x.name == "Piston Diameter [mm]")
    assert diameter.value == "34" and diameter.unit == "mm" and "[mm]" in diameter.raw_text


def test_no_fitted_manufacturer_keeps_oe_literal_without_inventing_a_namespace():
    soup = BeautifulSoup(document("343640"), "html.parser")
    soup.select_one(".mtab5 .table-rows").clear()
    result = lookup(http=Http({"343640": str(soup)}))
    assert not any(r.relation_type == "OEM_REFERENCE" for r in result.relationships)
    assert len([x for x in result.attributes if x.name.startswith("OE numbers")]) == 30


def test_published_number_spelling_is_not_rewritten_to_the_request_format():
    soup = BeautifulSoup(document("343640"), "html.parser")
    wrap = soup.select_one(".product-type-wrap")
    direct = wrap.find(string=True, recursive=False)
    direct.replace_with("Budweg No: 00 343640-A")
    assert parse_product(str(soup), "00343640A").number == "00 343640-A"


def test_explicit_owned_short_code_is_not_rejected_by_foreign_search_length_rules():
    soup = BeautifulSoup(document("203427"), "html.parser")
    wrap = soup.select_one(".product-type-wrap")
    wrap.find(string=True, recursive=False).replace_with("Budweg No: 2101")
    assert parse_product(str(soup), "2101").number == "2101"
    http = Http()
    assert BudwegAdapter(http).identify("2101") == [] and http.calls == []


def test_wrong_page_marker_is_a_failure_not_a_duplicate_first_page():
    first, next_url = paging(document("343640"), "343640")
    second, _ = paging(document("343640"), "343640", page=1, next_page=None)
    with pytest.raises(SourceError, match="wrong page"):
        lookup(http=Http({"343640": first, next_url: second}), skip=True)


def test_pagination_limit_does_not_fetch_an_unusable_extra_page(monkeypatch):
    import parsers.adapters.budweg as module
    monkeypatch.setattr(module, "MAX_TAB_PAGES", 1)
    first, _ = paging(document("343640"), "343640")
    http = Http({"343640": first})
    with pytest.raises(SourceError, match="limit reached"):
        lookup(http=http, skip=True)
    assert len(http.calls) == 1


def test_missing_next_link_does_not_silently_drop_advertised_later_records():
    soup = BeautifulSoup(document("343640"), "html.parser")
    soup.select_one(".mtab5 .table-rows").append(BeautifulSoup('<div class="pagination"><a class="page-numbers" href="https://budweg-catalog.com/product/page/2/?article=343640&product-tab=compatible-applications">2</a></div>', "html.parser"))
    with pytest.raises(SourceError, match="advertises later"):
        lookup(http=Http({"343640": str(soup)}), skip=True)


def test_compatible_caliper_paging_is_independent_of_application_paging():
    first, next_url = paging(document("233411"), "233411", tab="mtab3", slug="compatible-caliper")
    row = BeautifulSoup('<div class="table-row"><a href="https://budweg-catalog.com/product/?article=345632">345632</a></div>', "html.parser").select_one(".table-row")
    second = one_row_page(document("233411"), row, tab="mtab3")
    second, _ = paging(second, "233411", tab="mtab3", slug="compatible-caliper", page=2, next_page=None)
    adapter = BudwegAdapter(Http({"233411": first, next_url: second}))
    result = adapter._all_rows(adapter._product("233411"), "Compatible calipers")
    assert len(result) == 11 and result[-1][0].get_text(strip=True) == "345632"


def test_worker_archives_successful_response_before_next_page_failure():
    first, next_url = paging(document("343640"), "343640")
    class Session:
        headers = {}
        def request(self, method, url, **kwargs):
            assert method == "GET"
            return SimpleNamespace(status_code=500 if url == next_url else 200, text="Database Error" if url == next_url else first)
    http = PoliteSession(session=Session(), limiter=RateLimiter(0))
    # Diagnostic fake clock: no real sleeping or network; pacing is tested below.
    http.limiter.wait = lambda host: None
    result = run_lookup([BudwegAdapter(http)], LookupRequest("Budweg", "343640", "aftermarket"), "failure-test", load_schema())
    assert result.sources == [] and result.relationships == [] and result.applications == []
    assert "HTTP 500" in result.errors[0]["message"]
    assert len(result.documents) == 1 and result.documents[0]["body"] == first
    assert result.documents[0]["source_key"] == "budweg"


def test_all_real_transport_reads_keep_five_second_spacing_and_lossless_archive():
    now, times = [100.0], []
    def sleep(seconds):
        now[0] += seconds
    class Session:
        headers = {}
        def request(self, method, url, **kwargs):
            assert method == "GET" and url == PRODUCT_URL
            times.append(now[0])
            return SimpleNamespace(status_code=200, text=document(kwargs["params"]["article"]))
    http = PoliteSession(session=Session(), limiter=RateLimiter(2, clock=lambda: now[0], sleep=sleep))
    result = run_lookup([BudwegAdapter(http)], LookupRequest("Budweg", "343640", "aftermarket"), "transport-test", load_schema())
    assert result.errors == [] and times == [100.0, 105.0]
    assert len(result.documents) == 2
    assert [x["body"] for x in result.documents] == [document("343640"), document("203427")]
    assert all(x["parser_version"] == "1.0.0" and x["source_key"] == "budweg" for x in result.documents)
