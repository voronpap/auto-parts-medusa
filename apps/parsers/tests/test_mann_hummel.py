from __future__ import annotations

import json
from pathlib import Path

import pytest

from parsers.adapters import LookupRequest
from parsers.adapters.mann_hummel import (
    FiltronAdapter,
    MannFilterAdapter,
    parse_comparison_numbers,
    parse_product_page,
)
from parsers.http import SourceError
from parsers.worker import load_schema, run_lookup

FIXTURES = Path(__file__).parent / "fixtures"
PAGE = (FIXTURES / "mann_w712_95_small.html").read_text(encoding="utf-8")
COMPARISON = json.loads((FIXTURES / "mann_cmp_w712_95.json").read_text(encoding="utf-8"))
CROSS = json.loads((FIXTURES / "mann_cross_06A115561B.json").read_text(encoding="utf-8"))


class FakeHttp:
    def __init__(self, page: str | None = PAGE, error: Exception | None = None, api_error: Exception | None = None):
        self._page = page
        self._error = error
        self._api_error = api_error
        self.api_calls: list = []
        self.urls: list[str] = []

    def fetch(self, url, **kwargs):
        self.urls.append(url)

        if self._error:
            raise self._error

        return self._page

    def fetch_json(self, url, **kwargs):
        self.api_calls.append((url, kwargs))

        if self._api_error:
            raise self._api_error

        return CROSS if "smart_search" in kwargs["params"]["query"] else COMPARISON


def lookup(number="W 712/95", **kwargs):
    http = FakeHttp(**kwargs)
    return MannFilterAdapter(http).lookup(LookupRequest("MANN-FILTER", number, "aftermarket")), http  # type: ignore[arg-type]


def test_page_address_is_built_from_the_number():
    _, http = lookup("W 712/95")

    assert http.urls == [
        "https://www.mann-filter.com/ua-uk/catalog/search-results/product.html/w712/95_mann-filter.html"
    ]
    assert FiltronAdapter(FakeHttp()).product_url("OP 520") == (  # type: ignore[arg-type]
        "https://filtron.eu/en/catalog/search-results/product.html/op520_filtron.html"
    )


def test_vehicles_become_structured_fitment_and_are_not_repeated():
    result, _ = lookup()
    first = result.applications[0]

    assert (first.make, first.model, first.engine, first.engine_code) == ("AUDI", "A1 (8X)", "1.0 TFSI", "CHZE")
    assert (first.year_from, first.year_to, first.power_kw) == (2016, 2018, 60.0)
    assert first.raw_text == "AUDI A1 (8X) 1.0 TFSI | Oil Filter | CHZE | 999 ccm | 60 kW | 01.2016 - 10.2018"
    # The page carries the table twice; each vehicle is reported once.
    refs = [a.record_ref for a in result.applications]
    assert len(refs) == len(set(refs))


def test_make_alias_in_brackets_is_dropped():
    result, _ = lookup()

    assert "VW (VOLKSWAGEN)" not in {a.make for a in result.applications}


def test_dimensions_and_technical_data_become_attributes():
    result, _ = lookup()
    attributes = {a.name: a.value for a in result.attributes}

    assert attributes["Назва"].endswith("W 712/95")
    assert attributes["Висота"] == "79 мм"
    assert attributes["Кількість зворотних клапанів"] == "1"


def test_product_gallery_returns_unique_product_photos_only():
    record_url = "https://www.mann-filter.com/ru-ru/catalog/product.html/w712/95_mann-filter.html"
    gallery = """
    <h1>MANN-FILTER W 712/95</h1>
    <img class="cmp-product__gallery-img"
         alt="Product Image W712/95_MANN-FILTER"
         src="https://s7g10.scene7.com/is/image/mannhummel/W_712.95-1?qlt=82">
    <img class="cmp-product__gallery-img"
         alt="Product Image W712/95_MANN-FILTER"
         src="https://s7g10.scene7.com/is/image/mannhummel/W_712.95-filter-with-box?qlt=82">
    <img class="cmp-product__gallery__print-img cmp-product__gallery-img"
         alt="Product Image W712/95_MANN-FILTER"
         src="https://s7g10.scene7.com/is/image/mannhummel/W_712.95-1?qlt=82">
    <img class="cmp-product__gallery-img" alt="Product Image" src="https://example.com/not-a-product-photo.jpg">
    <img src="https://www.mann-filter.com/logo.svg" alt="MANN-FILTER logo">
    """

    _, result = parse_product_page(gallery, record_url)

    assert [image.url for image in result.images] == [
        "https://s7g10.scene7.com/is/image/mannhummel/W_712.95-1?qlt=82",
        "https://s7g10.scene7.com/is/image/mannhummel/W_712.95-filter-with-box?qlt=82",
    ]
    assert all(image.kind == "photo" and image.record_url == record_url for image in result.images)


def test_comparison_numbers_become_crosses_to_other_makers():
    result, http = lookup()
    crosses = {(r.to.brand, r.to.number): r for r in result.relationships}

    assert ("HENGST", "H317W") in crosses and ("MAHLE", "OC 1196/1") in crosses
    # The catalogue's label is brought to the name the catalog already uses.
    assert ("febi", "108330") in crosses
    assert crosses[("HENGST", "H317W")].relation_type == "AFTERMARKET_CROSS"
    assert crosses[("HENGST", "H317W")].raw_relation_text == "comparison number: HENGST H317W"
    url, kwargs = http.api_calls[0]
    assert url == "https://www.mann-filter.com/api/graphql/catalog-prod"
    assert json.loads(kwargs["params"]["variables"]) == {"sku": "W712/95_MANN-FILTER"}
    assert kwargs["headers"] == {"Store": "pcat_mf_ua_store_uk"}


def test_vehicle_maker_label_makes_an_oe_reference():
    data = {"data": {"products": {"items": [{"sku": "X", "comparison_numbers": [
        {"label": "HENGST", "value": ["H1"]},
        {"label": "VW GROUP (AUDI/SEAT/SKODA/VW)", "value": ["06A 115 561 B", "06A 115 561 B"]},
    ]}]}}}
    found = parse_comparison_numbers(data, "u")

    assert [(r.to.brand, r.to.number_type, r.to.number, r.relation_type) for r in found] == [
        ("VW", "oem", "06A 115 561 B", "OEM_REFERENCE"),
        ("HENGST", "aftermarket", "H1", "AFTERMARKET_CROSS"),
    ]


def test_another_makers_number_finds_the_product_listed_for_it():
    adapter = MannFilterAdapter(FakeHttp())  # type: ignore[arg-type]
    result = adapter.lookup_foreign(LookupRequest("Volkswagen", "06A115561B", "oem"))

    assert len(result.relationships) == 1
    cross = result.relationships[0]
    assert (cross.to.brand, cross.to.number, cross.relation_type, cross.direction) == (
        "MANN-FILTER", "W 719/30", "OEM_REFERENCE", "incoming",
    )
    assert cross.record_url.endswith("/product.html/w719/30_mann-filter.html")


def test_same_number_under_another_maker_is_not_a_match():
    adapter = MannFilterAdapter(FakeHttp())  # type: ignore[arg-type]

    # The catalogue lists 06A 115 561 B for the VW group only.
    assert adapter.lookup_foreign(LookupRequest("Toyota", "06A115561B", "oem")).is_empty
    assert adapter.lookup_foreign(LookupRequest("VW", "06A115561", "oem")).is_empty
    assert adapter.lookup_foreign(LookupRequest("VW", "561B", "oem")).is_empty


def test_foreign_number_is_looked_up_through_the_worker():
    adapter = MannFilterAdapter(FakeHttp())  # type: ignore[arg-type]
    result = run_lookup([adapter], LookupRequest("VW", "06A 115 561 B", "oem"), "w", load_schema())

    assert [r["to"]["number"] for r in result.relationships] == ["W 719/30"]
    # No source documents VW's own numbers, and the task says so.
    assert "No adapter covers brand" in result.errors[0]["message"]


def test_unknown_number_is_an_empty_result_not_an_error():
    result, _ = lookup("ZZ 000", error=SourceError("HTTP 404"))

    assert result.is_empty


def test_other_failures_are_reported():
    with pytest.raises(SourceError):
        lookup(error=SourceError("HTTP 503"))


def test_a_page_for_another_product_is_not_accepted():
    result, _ = lookup("W 999/99")

    assert result.is_empty


def test_result_matches_the_catalog_schema():
    adapter = MannFilterAdapter(FakeHttp())  # type: ignore[arg-type]
    result = run_lookup([adapter], LookupRequest("Mann Filter", "W 712/95", "aftermarket"), "w", load_schema())

    assert result.sources[0]["name"] == "MANN-FILTER (каталог виробника)"
    assert result.errors == []


def test_chinese_makers_are_vehicle_makers_too():
    data = {"data": {"products": {"items": [{"sku": "X", "comparison_numbers": [
        {"label": "CHERY", "value": ["480-1012010"]},
        {"label": "GREAT WALL", "value": ["1017100-ED01"]},
    ]}]}}}

    assert [(r.to.brand, r.to.number_type, r.relation_type) for r in parse_comparison_numbers(data, "u")] == [
        ("CHERY", "oem", "OEM_REFERENCE"),
        ("GREAT WALL", "oem", "OEM_REFERENCE"),
    ]


def test_oe_list_of_a_product_gives_oe_references_first():
    data = {"data": {"products": {"items": [{"sku": "X", "oe_numbers": [
        {"label": "CHERY", "value": ["480-1012010"]},
        {"label": "LINDE", "value": ["0009831600"]},
    ], "comparison_numbers": [{"label": "HENGST", "value": ["H1"]}]}]}}}
    found = parse_comparison_numbers(data, "u")

    assert [(r.to.brand, r.to.number_type, r.relation_type, r.raw_relation_text) for r in found] == [
        ("CHERY", "oem", "OEM_REFERENCE", "OE number: CHERY 480-1012010"),
        # Listed as OE by the catalogue, though not a car maker.
        ("LINDE", "oem", "OEM_REFERENCE", "OE number: LINDE 0009831600"),
        ("HENGST", "aftermarket", "AFTERMARKET_CROSS", "comparison number: HENGST H1"),
    ]
