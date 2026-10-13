from __future__ import annotations

import json
from pathlib import Path

from parsers.adapters import LookupRequest
from parsers.adapters.bilstein_group import (
    API_URL,
    INIT_URL,
    BilsteinGroupAdapter,
)
from parsers.http import SourceBlocked
from parsers.worker import load_schema, run_lookup

FIXTURES = Path(__file__).parent / "fixtures"


def fixture(name: str):
    return json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))


class FakeHttp:
    """Serves saved API responses; records what was asked."""

    def __init__(self, searches: dict[str, str], fail_first_api_call: bool = False):
        self._searches = searches
        self._fail = fail_first_api_call
        self.calls: list[tuple[str, dict]] = []

    def fetch(self, url, **kwargs):
        self.calls.append((url, {}))
        return "{}"

    def fetch_json(self, url, params=None, headers=None, **kwargs):
        self.calls.append((url, dict(params or {})))

        if self._fail:
            self._fail = False
            raise SourceBlocked("HTTP 401")

        if url == API_URL:
            key = (params["filter[phrase]"], params["filter[vehicleType]"])
            name = self._searches.get(key[0]) if key[1] == "CAR" else None
            return fixture(name) if name else fixture("bilstein_search_none")

        return fixture("bilstein_article_26374")


def adapter(searches=None, **kwargs):
    http = FakeHttp(searches or {"26374": "bilstein_search_26374"}, **kwargs)
    return BilsteinGroupAdapter(http), http  # type: ignore[arg-type]


def test_oe_numbers_are_reported_exactly_as_the_catalog_writes_them():
    source, _ = adapter()
    result = source.lookup(LookupRequest("febi", "26374", "aftermarket"))
    oe = [r for r in result.relationships if r.relation_type == "OEM_REFERENCE"]

    assert [(r.to.brand, r.to.number_type, r.to.number) for r in oe] == [
        ("Mercedes-Benz", "oem", "000 993 11 76")
    ]
    assert oe[0].raw_relation_text == "OE number"
    assert oe[0].record_ref == "article 26374"


def test_same_master_article_under_another_brand_is_an_interchange():
    source, _ = adapter()
    result = source.lookup(LookupRequest("febi", "26374", "aftermarket"))
    sister = [r for r in result.relationships if r.relation_type == "MANUFACTURER_INTERCHANGE"]

    assert [(r.to.brand, r.to.number) for r in sister] == [("SWAG", "99 11 0444")]
    assert not sister[0].ambiguous
    assert "499223" in sister[0].raw_relation_text


def test_only_the_article_itself_matches_not_articles_mentioning_the_number():
    # The phrase search for 26374 returns twelve articles; one is febi 26374.
    source, _ = adapter()
    result = source.lookup(LookupRequest("febi", "26374", "aftermarket"))

    assert len([r for r in result.relationships if r.relation_type == "OEM_REFERENCE"]) == 1
    assert ("Назва", "Ланцюг ГРМ для розподільного валу") in [
        (a.name, a.value) for a in result.attributes
    ]


def test_number_under_another_brand_is_not_a_match():
    source, _ = adapter()

    assert source.lookup(LookupRequest("SWAG", "26374", "aftermarket")).is_empty


def test_number_is_found_however_it_is_spaced():
    source, _ = adapter({"99110444": "bilstein_search_99110444"})
    result = source.lookup(LookupRequest("swag", "99110444", "aftermarket"))

    assert not result.is_empty
    assert result.relationships[0].record_ref == "article 99 11 0444"


def test_unknown_number_gives_an_empty_result_after_trying_cars_and_trucks():
    source, http = adapter({})
    result = source.lookup(LookupRequest("febi", "ZZZNOPE12345", "aftermarket"))

    assert result.is_empty
    assert [call[1].get("filter[vehicleType]") for call in http.calls[1:]] == ["CAR", "TRUCK"]


def test_attributes_keep_units():
    source, _ = adapter()
    result = source.lookup(LookupRequest("febi", "26374", "aftermarket"))
    attributes = {(a.name, a.value, a.unit) for a in result.attributes}

    assert ("Крок ланцюга", "8", "мм") in attributes
    assert ("Кількість ланок ланцюга", "126", None) in attributes


def test_visitor_session_is_opened_once_and_reopened_when_it_expires():
    source, http = adapter()
    source.lookup(LookupRequest("febi", "26374", "aftermarket"))
    source.lookup(LookupRequest("febi", "26374", "aftermarket"))

    assert [call[0] for call in http.calls].count(INIT_URL) == 1

    source, http = adapter(fail_first_api_call=True)
    result = source.lookup(LookupRequest("febi", "26374", "aftermarket"))

    assert not result.is_empty
    assert [call[0] for call in http.calls].count(INIT_URL) == 2


def test_brands_this_source_covers():
    source, _ = adapter()

    assert source.supports(LookupRequest("FEBI BILSTEIN", "1", "aftermarket"))
    assert source.supports(LookupRequest("blue print", "1", "aftermarket"))
    assert not source.supports(LookupRequest("Bosch", "1", "aftermarket"))


def test_result_matches_the_catalog_schema():
    schema = load_schema()
    source, _ = adapter()
    result = run_lookup([source], LookupRequest("febi", "26374", "aftermarket"), "w", schema)

    assert result.sources[0]["name"].startswith("bilstein group")
    assert result.errors == []


def test_another_makers_number_finds_the_articles_that_list_it():
    source = BilsteinGroupAdapter(FakeHttp({"0009931176": "bilstein_search_99110444"}))  # type: ignore[arg-type]
    result = source.lookup_foreign(LookupRequest("Mercedes", "0009931176", "oem"))
    found = {(r.to.brand, r.to.number) for r in result.relationships}

    assert ("SWAG", "99 11 0444") in found
    assert all(r.relation_type == "OEM_REFERENCE" and r.direction == "incoming" for r in result.relationships)
    # An article that only mentions the number elsewhere, or lists it for
    # another maker, is not a match.
    assert ("febi", "44968") not in found
    assert source.lookup_foreign(LookupRequest("BMW", "0009931176", "oem")).is_empty
