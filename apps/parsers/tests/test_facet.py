import json
from pathlib import Path

import pytest

from parsers.adapters import LookupRequest
from parsers.adapters.facet import (
    BASE_URL, FacetAdapter, callback_reply, grid_argument, initial_controls,
    literal_object, parse_applications, parse_references, search_codes,
)
from parsers.http import PoliteSession, RateLimiter, SourceBlocked, SourceError
from parsers.worker import load_schema, run_lookup
from tools.facet_model_numbers import harvest, makers

FIXTURES = Path(__file__).parent / "fixtures"


def fixture(name):
    return (FIXTURES / ("facet_" + name)).read_text(encoding="utf-8")


def reply(html, state=None):
    state = state or {"keys": [], "callbackState": "next-state", "selection": "", "pageCount": 1, "pageSize": 15, "pageIndex": 0}
    return "/*DX*/(" + json.dumps({"id": 0, "result": {"stateObject": state, "html": "<%html%>"}}) + ")/*DXHTML*/" + html


class FakeHttp:
    def __init__(self, metadata=None, references=None):
        self.metadata, self.references = metadata, references
        self.calls = []

    def fetch_json(self, url, **kwargs):
        self.calls.append((url, kwargs))
        assert url == BASE_URL + "/Home/DettaglioFinale"
        assert kwargs["method"] == "POST"
        return self.metadata or json.loads(fixture("metadata_9.6027.json"))

    def fetch(self, url, **kwargs):
        self.calls.append((url, kwargs))
        if url == BASE_URL:
            return fixture("bootstrap.html")
        form = kwargs["form_body"]
        assert kwargs["method"] == "POST"
        control = form["DXCallbackName"]
        if control == "GVcrossReferenceBig":
            return reply(self.references or fixture("references_9.6027.html"))
        if control == "GVguidaApplicazioniBig":
            return reply(fixture("applications_9.6027.html"))
        if control == "GVArticoliFacet2":
            return reply(fixture("search_GVArticoliOE2.html"))
        assert control in ("GVArticoliOE2", "GVArticoliCR2")
        return reply(fixture("search_" + control + ".html"))


def test_own_lookup_preserves_explicit_oe_and_competitor_numbers():
    result = FacetAdapter(FakeHttp()).lookup(LookupRequest("FACET", "9.6027", "aftermarket"))
    assert len(result.relationships) == 6 and len(result.applications) == 4
    oe = [r for r in result.relationships if r.relation_type == "OEM_REFERENCE"]
    assert {(r.to.brand, r.to.number) for r in oe} == {("AUDI", "811 905 115"), ("VW", "811 905 115")}
    assert any(r.to.brand == "BOSCH" and r.to.number == "0 221 122 379" for r in result.relationships)
    assert any(r.to.brand == "KW" and r.to.number == "470 127" for r in result.relationships)
    assert all(r.record_ref == "FACET 9.6027" and r.record_url for r in result.relationships)


def test_foreign_number_requires_explicit_maker_and_is_incoming():
    result = FacetAdapter(FakeHttp()).lookup_foreign(LookupRequest("Audi", "811905115", "oem"))
    assert len(result.relationships) == 1
    cross = result.relationships[0]
    assert (cross.to.brand, cross.to.number, cross.direction, cross.relation_type) == ("FACET", "9.6027", "incoming", "OEM_REFERENCE")
    assert "811 905 115" in cross.raw_relation_text
    assert FacetAdapter(FakeHttp()).lookup_foreign(LookupRequest("Chery", "811905115", "oem")).is_empty


def test_unlabelled_reference_is_not_assigned_from_fitment():
    html = fixture("references_9.6027.html").replace(
        '<font style="cursor:pointer;">AUDI</font>', '<font style="cursor:pointer;"></font>')
    result = parse_references(html, "url")
    assert not any(r.to.brand == "AUDI" for r in result)
    assert all(not r.ambiguous for r in result)  # all retained rows have explicit maker labels


def test_third_party_replaced_by_is_not_a_replacement_of_facet():
    result = parse_references(fixture("references_9.6070.html"), "url")
    assert all(r.relation_type in ("OEM_REFERENCE", "COMPETITOR_REFERENCE") for r in result)
    assert any("Replaced by: F5SU-12029-AB" in r.raw_relation_text for r in result)
    assert not any(r.relation_type == "SUPERSEDED_BY" for r in result)


def test_application_months_and_function_are_preserved_without_guessed_fields():
    app = parse_applications(fixture("applications_9.6027.html"), "url")[0]
    assert (app.make, app.model, app.engine_code, app.year_from, app.year_to) == ("AUDI", "100 III 1.8", "DS", 1983, 1989)
    assert app.engine is app.position is app.market is None
    assert "08/1983-07/1989" in app.raw_text and "COIL" in app.constraints["function_on_vehicle"]


def test_partial_dates_do_not_invent_years_or_engine():
    html = fixture("applications_9.6027.html").replace("08/1983-07/1989", "08/1983-").replace("DS " , " ")
    app = parse_applications(html, "url")[0]
    assert app.year_from == 1983 and app.year_to is app.engine_code is app.engine is None


def test_metadata_status_and_package_code_are_not_interpreted():
    result = FacetAdapter(FakeHttp()).lookup(LookupRequest("FACET", "9.6027", "aftermarket"))
    attrs = {a.name: a for a in result.attributes}
    assert attrs["Confezione"].value == "07" and attrs["Confezione"].unit is None
    assert attrs["Stato"].value == "S" and attrs["SuperKit"].value == "0"


def test_source_numbers_preserve_zeros_internal_spaces_and_suffixes():
    metadata = json.loads(fixture("metadata_9.6027.json"))
    metadata["Cod"] = "00 9.6027A   "
    incoming = FacetAdapter(FakeHttp(metadata)).lookup_foreign(LookupRequest("Audi", "811905115", "oem"))
    # A search for another own code may not return this mismatched metadata.
    assert incoming.is_empty
    result = FacetAdapter(FakeHttp(metadata)).lookup(LookupRequest("FACET", "0096027A", "aftermarket"))
    assert any(a.name == "Cod" and a.value == "00 9.6027A" for a in result.attributes)


@pytest.mark.parametrize("number", ["9.602", "9.6027A", "ZZZNOTFOUND9"])
def test_fuzzy_own_identity_is_rejected(number):
    assert FacetAdapter(FakeHttp()).lookup(LookupRequest("FACET", number, "aftermarket")).is_empty


def test_unsupported_brand_blank_own_and_short_foreign_do_not_contact_source():
    http = FakeHttp()
    adapter = FacetAdapter(http)
    assert adapter.lookup(LookupRequest("EPS", "9.6027", "aftermarket")).is_empty
    assert adapter.lookup(LookupRequest("FACET", "", "aftermarket")).is_empty
    assert adapter.lookup_foreign(LookupRequest("Audi", "1234", "oem")).is_empty
    assert http.calls == []


def test_expansion_uses_returned_state_and_never_calls_pdf_or_account():
    http = FakeHttp()
    FacetAdapter(http).lookup(LookupRequest("FACET", "9.6027", "aftermarket"))
    forms = [kw["form_body"] for _, kw in http.calls if "form_body" in kw]
    expansion = next(f for f in forms if "EXPANDALL" in f.get("DXCallbackArgument", ""))
    assert json.loads(expansion["GVguidaApplicazioniBig"])["callbackState"] == "next-state"
    assert "parameter" not in expansion
    assert all(not any(s in url.lower() for s in ("captcha", "mail", "history", "login", "pdf")) for url, _ in http.calls)


@pytest.mark.parametrize("parser,name", [(parse_references, "references_9.6027.html"), (parse_applications, "applications_9.6027.html")])
def test_changed_table_columns_raise_instead_of_creating_false_records(parser, name):
    html = fixture(name).replace("CROSS REFERENCE", "CHANGED").replace("Engine Code", "CHANGED")
    with pytest.raises(SourceError, match="columns"):
        parser(html, "url")


def test_search_uses_explicit_onclick_code_and_deduplicates_visual_cards():
    html = fixture("search_GVArticoliOE2.html").replace(
        '>9.6027</font>', '>9.<font>6027</font></font>')
    assert list(search_codes(html)) == ["9.6027"]


def test_literals_are_data_not_executable_javascript():
    assert literal_object("{'a':true,'quoted':'it\\'s','array':[]}") == {"a": True, "quoted": "it's", "array": []}
    with pytest.raises(SourceError):
        literal_object("{'a':__import__('os').getcwd()}")
    with pytest.raises(SourceError):
        literal_object("[]")
    with pytest.raises(SourceError):
        callback_reply("<html>not a callback</html>")
    assert literal_object(json.dumps({"text": "it's 'quoted'"})) == {"text": "it's 'quoted'"}


def test_missing_identity_and_invalid_metadata_are_errors():
    with pytest.raises(SourceError, match="identity"):
        initial_controls("<title>OTHER CATALOG</title>")
    with pytest.raises(SourceError, match="metadata"):
        FacetAdapter(FakeHttp({"Success": "true"})).lookup(LookupRequest("FACET", "9.6027", "aftermarket"))


def test_grid_serializer_matches_public_sdk_lengths():
    assert grid_argument(["EXPANDALL"], {"keys": []}) == "c0:KV|2;[];GB|11;9|EXPANDALL;"
    assert "GB|13;8|GOTOPAGE1|1;" in grid_argument(["GOTOPAGE", 1], {"keys": []})


def test_dataview_paging_uses_colon_separator_and_source_state():
    class Paged(FakeHttp):
        def fetch(self, url, **kwargs):
            self.calls.append((url, kwargs))
            form = kwargs["form_body"]
            page = 1 if form["DXCallbackArgument"].startswith("c0:p") else 0
            if page:
                assert form["DXCallbackArgument"] == "c0:p0:15:PN1"
                assert "parameter" not in form
            return reply(f"page{page}", {"pageCount": 2, "pageSize": 15, "pageIndex": page})
    http = Paged()
    assert list(FacetAdapter(http)._view_pages({"C": {}}, "C", "route", "12345")) == ["page0", "page1"]


def test_schema_and_unmodified_raw_callback_archive():
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
    result = run_lookup([FacetAdapter(http)], LookupRequest("FACET", "9.6027", "aftermarket"), "test", load_schema())
    assert result.errors == [] and len(result.documents) == 5
    assert result.documents[2]["body"] == reply(fixture("references_9.6027.html"))
    assert result.documents[1]["params"]["form"] == {"codfacetFinale": "9.6027"}
    assert FacetAdapter.min_interval >= 5


def test_http_refusal_propagates_without_other_calls():
    class Blocked(FakeHttp):
        def fetch(self, url, **kwargs):
            self.calls.append((url, kwargs))
            raise SourceBlocked("HTTP 403")
    http = Blocked()
    with pytest.raises(SourceBlocked):
        FacetAdapter(http).lookup(LookupRequest("FACET", "9.6027", "aftermarket"))
    assert len(http.calls) == 1


def test_mg_oe_and_modern_chinese_fitment_use_explicit_labels():
    refs = parse_references(fixture("references_9.3001.html"), "url")
    assert any(r.to.brand == "MG" and r.to.number == "NSC90019C" and r.relation_type == "OEM_REFERENCE" for r in refs)
    apps = parse_applications(fixture("applications_9.3001.html"), "url")
    assert {(a.make, a.model) for a in apps} == {("MG", "ZS SUV 1.5 VTi"), ("MG (SAIC)", "550 1.8")}
    assert all(a.year_to is None for a in apps)


def test_regional_auto_maker_label_is_an_oe_not_competitor():
    refs = parse_references(fixture("references_9.6070.html"), "url")
    assert all(r.relation_type == "OEM_REFERENCE" for r in refs if r.to.brand in ("FORD AUSTRALIA", "FORD USA"))


class HarvestHttp(FakeHttp):
    def __init__(self, apps=None):
        super().__init__()
        self.tree = json.loads(fixture("harvest.json"))
        self.apps = apps or fixture("applications_9.3001.html")

    def fetch_json(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return json.loads(fixture("metadata_9.3001.json"))

    def fetch(self, url, **kwargs):
        if url == BASE_URL:
            return super().fetch(url, **kwargs)
        self.calls.append((url, kwargs))
        form = kwargs["form_body"]
        control = form["DXCallbackName"]
        state = {"keys": [], "pageCount": 1, "pageSize": 15, "pageIndex": 0}
        if control == "GVCostruttori":
            return reply(self.tree["makers_html"], state)
        if control == "GVModelliDaCostruttore":
            # Fixture retains MG (SAIC), not legacy MG's separate models.
            return reply(self.tree["models_html"] if form["SessionName"] == "003838" else "<table></table>", state)
        if control == "GVMotorizzazioniEstese":
            assert form["SessionName1"] == "550" and form["SessionName2"] == "003838"
            if "PAGEROWVALUES" in form["DXCallbackArgument"]:
                data = "FB|0|" + json.dumps(self.tree["engine_groups"])
                return "/*DX*/(" + json.dumps({"id": 0, "result": {"html": data}}) + ")"
            return reply("<table></table>", state)
        if control == "GVMotorizzazioniDaGruppo":
            assert form["SessionName"] == self.tree["engine_groups"][0]
            state["keys"] = self.tree["engines"]
            return reply("<table></table>", state)
        if control == "GVDettaglio":
            assert form["SessionName"] == self.tree["engines"][0]
            state["keys"] = self.tree["products"]
            return reply("<table></table>", state)
        assert control == "GVguidaApplicazioniBig"
        return reply(self.apps, state)


def test_vehicle_harvest_confirms_source_ids_identity_and_fitment():
    http = HarvestHttp()
    assert list(harvest(http, ["MG"], ["550"], 1, 1, 1)) == ["9.3001"]
    assert any("PAGEROWVALUES" in kw.get("form_body", {}).get("DXCallbackArgument", "") for _, kw in http.calls)
    assert list(harvest(HarvestHttp(), ["CHERY"], max_products=1)) == []


def test_harvest_rejects_product_without_requested_make_fitment():
    apps = fixture("applications_9.3001.html").replace("MG", "AUDI")
    assert list(harvest(HarvestHttp(apps), ["MG"], ["550"], 1, 1, 1)) == []


def test_unknown_maker_literal_and_functional_code_are_not_executed():
    with pytest.raises(SourceError):
        list(makers('<a onclick="OnBeginCallbackImageGallery(boom());">x</a>'))
    class Invalid(HarvestHttp):
        def fetch(self, url, **kwargs):
            return "/*DX*/({'result':{'html':'FB|0|__import__(\\'os\\').getcwd()'}})"
    with pytest.raises(SourceError):
        FacetAdapter(Invalid())._page_values("C", "route", "", {"keys": []}, "strID")


def test_nonadvancing_pager_is_a_source_error():
    class Static(FakeHttp):
        def fetch(self, url, **kwargs):
            return reply("same", {"pageCount": 2, "pageSize": 15, "pageIndex": 0})
    with pytest.raises(SourceError, match="advance"):
        list(FacetAdapter(Static())._view_pages({"C": {}}, "C", "route", ""))


def test_grid_pages_uses_own_pager_argument_not_custom_search_reset():
    class Paged(FakeHttp):
        def fetch(self, url, **kwargs):
            self.calls.append((url, kwargs))
            form = kwargs["form_body"]
            page = int("GOTOPAGE" in form["DXCallbackArgument"])
            if page:
                assert "parameter" not in form
                assert "8|GOTOPAGE1|1" in form["DXCallbackArgument"]
            return reply(f"<script>dxo.pageCount=2;</script><p>page{page}</p>")
    http = Paged()
    assert len(list(FacetAdapter(http)._grid_pages({"C": {}}, "C", "route", "12345"))) == 2


def test_page_limit_is_explicit_not_silently_complete():
    class Many(FakeHttp):
        def fetch(self, url, **kwargs):
            return reply("<script>dxo.pageCount=20;</script>", {"pageCount": 20, "pageSize": 15, "pageIndex": 0})
    adapter = FacetAdapter(Many())
    notices = []
    assert len(list(adapter._grid_pages({"C": {}}, "C", "route", "", max_pages=1, notices=notices))) == 1
    assert notices[0].value == "read 1 of 20 pages"
    notices = []
    assert len(list(adapter._view_pages({"C": {}}, "C", "route", "", max_pages=1, notices=notices))) == 1
    assert notices[0].value == "read 1 of 20 pages"


def test_own_compact_number_is_resolved_only_by_exact_native_card():
    class Exact(FakeHttp):
        def fetch_json(self, url, **kwargs):
            if kwargs["form_body"]["codfacetFinale"] == "96027":
                self.calls.append((url, kwargs))
                return {"Success": False}
            return super().fetch_json(url, **kwargs)
    result = FacetAdapter(Exact()).lookup(LookupRequest("FACET", "96027", "aftermarket"))
    assert len(result.relationships) == 6
    assert any(a.name == "Cod" and a.value == "9.6027" for a in result.attributes)
