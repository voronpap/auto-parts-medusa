from __future__ import annotations

from pathlib import Path

import pytest

from parsers.adapters import LookupRequest
from parsers.adapters.mann_hummel import FiltronAdapter, MannFilterAdapter, parse_product_page
from parsers.http import SourceError
from parsers.worker import load_schema, run_lookup

PAGE = (Path(__file__).parent / "fixtures" / "mann_w712_95_small.html").read_text(encoding="utf-8")


class FakeHttp:
    def __init__(self, page: str | None = PAGE, error: Exception | None = None):
        self._page = page
        self._error = error
        self.urls: list[str] = []

    def fetch(self, url, **kwargs):
        self.urls.append(url)

        if self._error:
            raise self._error

        return self._page


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


def test_this_source_states_no_crosses():
    result, _ = lookup()

    assert result.relationships == []


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


def test_vehicles_still_in_production_have_no_end_year():
    result, _ = lookup()

    assert all(a.year_to is None or a.year_to < 2100 for a in result.applications)
    assert any(a.year_to is None for a in result.applications)
