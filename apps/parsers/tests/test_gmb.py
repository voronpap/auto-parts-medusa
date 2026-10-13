import json
from pathlib import Path

import pytest

from parsers.adapters import ADAPTERS, LookupRequest
from parsers.adapters.gmb import (AJAX_URL, BASE_URL, GmbAdapter, bootstrap, parse_applications,
                                 parse_details, product_links, vehicle_pairs)
from parsers.http import PoliteSession, RateLimiter, SourceBlocked, SourceError
from parsers.worker import load_schema, run_lookup


def fixture(number="180-2620"):
    return json.loads((Path(__file__).parent / "fixtures" / ("gmb_" + number.replace("-", "_") + ".json")).read_text(encoding="utf-8"))


class FakeHttp:
    def __init__(self, data=None):
        self.data = data or fixture()
        self.calls = []

    def fetch(self, url, **kwargs):
        self.calls.append((url, kwargs))
        if url == BASE_URL + "/":
            return self.data["search"]
        assert url.startswith(BASE_URL + "/product/")
        return self.data["page"]

    def fetch_json(self, url, **kwargs):
        self.calls.append((url, kwargs))
        assert url == AJAX_URL
        params = kwargs["params"]
        assert params["action"] == "opticat_ajax_lookup"
        assert params["part_number"] == bootstrap(self.data["page"])[2]
        assert params["brand_code"] == "BFBQ"
        if params["lookup"] == "part_details":
            assert params["php"] == "0"
            return self.data["details"]
        assert params["lookup"] == "applications"
        return self.data["applications"] if params["php"] == "0" else self.data["application_table"]


def lookup(data=None, number="1802620"):
    return GmbAdapter(FakeHttp(data)).lookup(LookupRequest("GMB", number, "aftermarket"))


def test_real_water_pump_has_named_oe_and_padded_item_gtin():
    result = lookup()
    oe = [r for r in result.relationships if r.relation_type == "OEM_REFERENCE"]
    assert [(r.to.brand, r.to.number_type, r.to.number) for r in oe] == [("Volkswagen", "oem", "079121014M")]
    gtin = [r for r in result.relationships if r.relation_type == "GTIN_IDENTIFIER"]
    assert len(gtin) == 1 and gtin[0].to.number == "00083286948921"
    assert all(r.record_ref and r.record_url and r.raw_relation_text for r in result.relationships)


def test_oe_manufacturer_is_not_guessed_from_audi_fitment():
    result = lookup()
    assert {a.make for a in result.applications} == {"Audi"}
    assert not any(r.to.brand == "Audi" for r in result.relationships)


def test_raw_aces_records_are_not_ui_year_range_aggregates():
    result = lookup()
    assert len(result.applications) == 29
    assert all(a.year_from == a.year_to and a.quantity == 1 for a in result.applications)
    assert {(a.model, a.year_from) for a in result.applications if a.model == "S6"} == {("S6", y) for y in range(2013, 2019)}
    assert all(a.engine == "V8 4.0L 3993cc" and a.engine_code is None and a.market is None for a in result.applications)


def test_gaps_are_not_filled_from_broader_display_ranges():
    data = fixture()
    data["applications"] = [r for r in data["applications"] if r["acesApp"]["baseVehicleName"] != "2014 Audi S6"]
    result = lookup(data)
    assert not any(a.model == "S6" and a.year_from == 2014 for a in result.applications)


def test_transport_trailing_dash_is_not_an_owned_number_alias():
    http = FakeHttp()
    result = GmbAdapter(http).lookup(LookupRequest("GMB", "1802620", "aftermarket"))
    assert any(k[1].get("params", {}).get("part_number") == "180-2620-" for k in http.calls)
    assert any(a.name == "Part Number" and a.value == "180-2620" for a in result.attributes)
    assert not any(a.value == "180-2620-" for a in result.attributes)


def test_spaces_zeroes_hyphens_and_suffix_in_reference_are_preserved():
    data = fixture()
    data["details"]["piesItem"]["partInterchanges"][0]["partNumber"] = "000 791-21014M-X"
    assert lookup(data).relationships[0].to.number == "000 791-21014M-X"


def test_peer_reference_does_not_become_exact_cross_or_replacement():
    result = lookup(fixture("150-0001"), "1500001")
    peer = result.relationships[0]
    assert peer.relation_type == "COMPETITOR_REFERENCE" and peer.ambiguous
    assert peer.to.brand == "US Motor Works" and peer.to.number == "MCK1066"
    assert '"interchangeTypeCode":"S"' in peer.raw_relation_text
    assert not any(r.relation_type in {"SUPERSEDED_BY", "AFTERMARKET_CROSS", "CONTAINS"} for r in result.relationships)


def test_missing_manufacturer_is_not_reconstructed_from_shared_fitment():
    data = fixture()
    data["details"]["piesItem"]["partInterchanges"][0]["brandName"] = ""
    result = lookup(data)
    assert not any(r.relation_type == "OEM_REFERENCE" for r in result.relationships)
    assert any(a.name.startswith("Unlabelled interchange (unmapped)") for a in result.attributes)


def test_source_typo_and_package_scope_are_retained():
    result = lookup()
    assert any(a.name == "Bolts Inlcuded" and a.value == "No" for a in result.attributes)
    expected_unit = fixture()["details"]["piesItem"]["packages"][0]["dimensions"]["uomName"]
    assert any(a.name == "Package 1.dimensions.height" and a.unit == expected_unit for a in result.attributes)
    assert any(a.name == "Package 2.weights.weight" and a.unit == "Kilogram" for a in result.attributes)
    assert len([r for r in result.relationships if r.relation_type == "GTIN_IDENTIFIER"]) == 1


@pytest.mark.parametrize("field,value", [("brandName", "Audi"), ("brandCode", "OTHER"), ("partNumber", "180-2621")])
def test_pies_wrong_identity_is_rejected(field, value):
    data = fixture()
    data["details"]["piesItem"][field] = value
    with pytest.raises(SourceError, match="identity"):
        lookup(data)


@pytest.mark.parametrize("field,value", [("brandName", "Audi"), ("brandCode", "OTHER"), ("partNumber", "180-2621")])
def test_aces_wrong_identity_is_rejected(field, value):
    data = fixture()
    data["applications"][0]["acesApp"][field] = value
    with pytest.raises(SourceError, match="identity"):
        lookup(data)


def test_partial_vehicle_attributes_keep_conditions_without_engine_code_guess():
    data = fixture()
    app = data["applications"][0]["acesApp"]
    app["attributes"] = [{"attributeType": "EngineDesignationId", "attributeValueName": "CJXA"},
                         {"attributeType": "PositionId", "attributeValueName": "Front Left"}]
    app["notes"] = ["Only with specified cooling system"]
    app["quals"] = [{"qualId": 99, "qualText": "Except fleet vehicles"}]
    result = lookup(data).applications[0]
    assert result.engine is None and result.engine_code is None and result.side is None
    assert result.position == "Front Left"
    assert result.constraints["notes"] == app["notes"] and result.constraints["quals"] == app["quals"]
    assert "EngineDesignationId" in result.raw_text


def test_model_names_are_not_split_into_single_words():
    data = fixture()
    record = data["applications"][0]
    record["acesApp"]["baseVehicleName"] = "2016 Land Rover Range Rover Sport"
    apps = parse_applications([record], "180-2620", "BFBQ", {("Land Rover", "Range Rover Sport")}, "url")
    assert apps[0].make == "Land Rover" and apps[0].model == "Range Rover Sport"


def test_unknown_name_uses_explicit_source_vehicle_id_resolution():
    data = fixture()
    record = data["applications"][0]
    record["acesApp"]["baseVehicleName"] = "2016 Land Rover Range Rover Sport"
    calls = []
    def resolve(year, base_id, name):
        calls.append((year, base_id, name))
        return "Land Rover", "Range Rover Sport"
    apps = parse_applications([record], "180-2620", "BFBQ", set(), "url", resolve)
    assert calls[0][0] == 2016 and apps[0].make == "Land Rover"


def test_unknown_vehicle_and_bad_table_fail_closed():
    data = fixture()
    with pytest.raises(SourceError, match="cannot be split"):
        parse_applications(data["applications"], "180-2620", "BFBQ", set(), "url")
    data["application_table"]["data"]["html"] = "<table>not the source schema</table>"
    with pytest.raises(SourceError, match="headings"):
        lookup(data)


def test_resolved_vehicle_id_must_agree_with_the_literal_aces_name():
    data = fixture()
    with pytest.raises(SourceError, match="conflicts"):
        parse_applications(data["applications"], "180-2620", "BFBQ", set(), "url",
                           lambda year, base_id, name: ("Audi", "Wrong Model"))


def test_false_or_missing_payload_is_not_empty_success():
    data = fixture()
    data["details"] = {"status": 500}
    with pytest.raises(SourceError):
        lookup(data)
    data = fixture()
    data["applications"] = []
    with pytest.raises(SourceError, match="no records"):
        lookup(data)


def test_identify_is_one_quick_request_and_uses_visible_exact_code():
    http = FakeHttp()
    result = GmbAdapter(http).identify("1802620")
    assert result == [{"brand": "GMB", "number": "180-2620", "title": "Engine Water Pump 180-2620"}]
    assert len(http.calls) == 1


def test_lookalikes_foreign_brands_and_foreign_search_are_not_matches():
    http = FakeHttp()
    adapter = GmbAdapter(http)
    assert adapter.lookup(LookupRequest("Audi", "180-2620", "oem")).is_empty
    assert adapter.lookup_foreign(LookupRequest("Volkswagen", "079121014M", "oem")).is_empty
    assert http.calls == [] and not adapter.cross_search
    assert adapter.identify("180262") == []


def test_external_urls_and_url_only_numbers_are_not_product_identity():
    assert product_links('<h2 class="fl-post-feed-title"><a href="https://attacker.invalid/product/180-2620/">Engine Water Pump 180-2620</a></h2>') == []
    assert product_links('<h2 class="fl-post-feed-title"><a href="https://gmb.net/product/180-2620/">Unrelated item</a></h2>') == []


def test_skip_fitment_only_omits_fitment_requests_not_crosses():
    http = FakeHttp()
    adapter = GmbAdapter(http)
    adapter.skip_fitment = True
    result = adapter.lookup(LookupRequest("GMB", "1802620", "aftermarket"))
    assert result.relationships and result.attributes and not result.applications
    assert len(http.calls) == 3


def test_long_source_text_is_reconstructable_not_truncated():
    data = fixture()
    text = "Literal source description. " * 100
    data["details"]["piesItem"]["descriptions"] = [{"descriptionTypeName": "Long", "languageCode": "EN", "value": text}]
    result = lookup(data)
    pieces = [a for a in result.attributes if a.name.startswith("Long (EN)")]
    assert "".join(a.value for a in pieces) == text
    assert all(len(a.value) <= 500 and len(a.raw_text) <= 2000 for a in pieces)


def test_large_raw_application_keeps_all_conditions_in_format():
    data = fixture()
    data["applications"][0]["acesApp"]["notes"] = ["Source condition " * 200]
    result = lookup(data)
    assert len(result.applications[0].raw_text) <= 2000
    assert result.applications[0].constraints["notes"] == data["applications"][0]["acesApp"]["notes"]


def test_nullable_optional_fields_and_zero_quantity_are_not_guessed():
    data = fixture()
    data["details"]["piesItem"]["packages"] = None
    data["details"]["piesItem"]["kits"] = None
    data["applications"][0]["acesApp"]["qty"] = 0
    result = lookup(data)
    assert result.applications[0].quantity == 0
    assert not any(a.name.startswith("Package ") for a in result.attributes)


def test_changed_availability_flag_and_array_shape_fail_closed():
    data = fixture()
    data["details"]["piesItem"]["hasACESApplications"] = "false"
    with pytest.raises(SourceError):
        lookup(data)
    data = fixture()
    data["details"]["piesItem"]["partInterchanges"] = {}
    with pytest.raises(SourceError):
        lookup(data)


def test_http_refusal_is_not_retried():
    class Refusal(FakeHttp):
        def fetch(self, url, **kwargs):
            self.calls.append((url, kwargs))
            raise SourceBlocked("catalogue refused")
    http = Refusal()
    with pytest.raises(SourceBlocked):
        GmbAdapter(http).lookup(LookupRequest("GMB", "1802620", "aftermarket"))
    assert len(http.calls) == 1


@pytest.mark.parametrize("number,apps", [("180-2620", 29), ("170-4240", 20), ("150-0001", 19)])
def test_real_fixtures_pass_full_exchange_schema(number, apps):
    result = run_lookup([GmbAdapter(FakeHttp(fixture(number)))],
                        LookupRequest("GMB", number.replace("-", ""), "aftermarket"), "test", load_schema())
    assert result.errors == [] and len(result.applications) == apps
    assert result.sources[0]["parser"]["version"] == "1.0.0"


def test_registered_and_stricter_host_pacing_keeps_lossless_archive():
    data = fixture()
    moment, calls = {"now": 0.0}, []
    class Session:
        headers = {}
        def request(self, method, url, **kwargs):
            assert method == "GET" and "verify" not in kwargs
            calls.append(moment["now"])
            if url == BASE_URL + "/":
                body = data["search"]
            elif "/product/" in url:
                body = data["page"]
            elif kwargs["params"]["lookup"] == "part_details":
                body = json.dumps(data["details"])
            else:
                body = json.dumps(data["applications"] if kwargs["params"]["php"] == "0" else data["application_table"])
            return type("Response", (), {"text": body, "status_code": 200})()
    limiter = RateLimiter(2, clock=lambda: moment["now"], sleep=lambda s: moment.update(now=moment["now"] + s))
    http = PoliteSession(limiter=limiter, session=Session())
    http.recorder = []
    result = GmbAdapter(http).lookup(LookupRequest("GMB", "1802620", "aftermarket"))
    assert GmbAdapter in ADAPTERS and len(result.applications) == 29
    assert calls == [0, 5, 10, 15, 20] and len(http.recorder) == 5
    assert json.loads(http.recorder[2]["body"]) == data["details"]
