from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path

from parsers.adapters import ADAPTERS, LookupRequest
from parsers.adapters.nrf import NrfAdapter, parse_applications, parse_product_page, parse_search
from parsers.worker import load_schema, run_lookup

FIXTURES = Path(__file__).parent / "fixtures"


def page(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


def fixture(name: str):
    return json.loads(page(name))


class FakeHttp:
    """Serves saved NRF responses and records every request."""

    def __init__(self):
        self.calls: list[tuple[str, dict | None]] = []

    def fetch(self, url, params=None, **kwargs):
        self.calls.append((url, params))

        if "catalogsearch/advanced/result" in url:
            return page("nrf_search_50539.html")

        return page("nrf_product_50539.html")

    def fetch_json(self, url, params=None, **kwargs):
        self.calls.append((url, params))
        return fixture("nrf_vehicles_50539.json")


def lookup(number: str = "50539"):
    http = FakeHttp()
    result = NrfAdapter(http).lookup(LookupRequest("NRF", number, "aftermarket"))  # type: ignore[arg-type]

    return result, http


def test_search_page_preserves_codes_and_product_addresses():
    assert parse_search(page("nrf_search_50539.html")) == [
        ("350539", "https://webshop.nrf.eu/kia-7491-14953-7009-12691.html"),
        ("50539", "https://webshop.nrf.eu/audi-18367.html"),
        ("50539A", "https://webshop.nrf.eu/audi-11134.html"),
    ]


def test_own_number_uses_only_the_exact_search_result():
    result, http = lookup()

    assert not result.is_empty
    assert http.calls == [
        ("https://webshop.nrf.eu/catalogsearch/advanced/result/", {"sku": "50539"}),
        ("https://webshop.nrf.eu/audi-18367.html", None),
        (
            "https://webshop.nrf.eu/rest/V1/products/50539/vehicles",
            {"searchCriteria[pageSize]": 5000},
        ),
    ]


def test_oe_numbers_keep_source_spelling_and_ambiguous_makers():
    result, _ = lookup()
    crosses = [relationship for relationship in result.relationships if relationship.relation_type == "OEM_REFERENCE"]

    assert {(r.to.brand, r.to.number) for r in crosses} == {
        (make, number)
        for make in ("AUDI", "SEAT")
        for number in ("8E0121251", "8E0121251A", "8E0121251AF")
    }
    assert all(r.ambiguous and "AUDI, SEAT" in (r.reason or "") for r in crosses)
    assert all(r.raw_relation_text == f"OE numbers: {r.to.number}" for r in crosses)


def test_vehicle_json_becomes_structured_fitment():
    result, _ = lookup()
    audi = result.applications[0]

    assert (audi.make, audi.model, audi.generation, audi.body) == ("AUDI", "A4", "2001 | B6", "CM")
    assert (audi.year_from, audi.year_to, audi.engine_code, audi.power_kw) == (2001, 2002, "AVJ", 110.0)
    assert audi.fuel == "Petrol"
    assert audi.raw_text == (
        "AUDI | A4 | B6 | 1.8 | 110 KW | 150 HP | 1781 | Petrol | AVJ | "
        "150 HP | 2001 | B6 | 09.2001 - 06.2002"
    )


def test_partial_vehicle_row_is_kept_without_inventing_missing_values():
    data = deepcopy(fixture("nrf_vehicles_50539.json"))
    data["items"] = [data["items"][1]]
    data["items"][0]["custom_attributes"] = [
        item
        for item in data["items"][0]["custom_attributes"]
        if item["attribute_code"] in {"v_brand_value", "v_range", "v_year_from"}
    ]
    applications, makes, total = parse_applications(data, "50539", "u")

    assert makes == ["SEAT"]
    assert total == 2
    assert len(applications) == 1
    assert (applications[0].model, applications[0].year_from, applications[0].year_to) == (
        "Exeo",
        2008,
        None,
    )
    assert applications[0].engine_code is None


def test_specifications_and_alternative_product_are_kept():
    result, _ = lookup()
    attributes = {attribute.name: attribute.value for attribute in result.attributes}
    alternatives = [r for r in result.relationships if r.relation_type == "MANUFACTURER_INTERCHANGE"]

    assert attributes["Core Length [mm]"] == "631 mm"
    assert attributes["EAN Code"] == "8718042031365"
    assert len(alternatives) == 1
    assert (alternatives[0].to.brand, alternatives[0].to.number) == ("NRF", "50539A")


def test_product_page_reads_hidden_oe_number():
    code, title, _, numbers = parse_product_page(page("nrf_product_50539.html"), "u")

    assert (code, title) == ("50539", "AUDI A4 1.9D 01-")
    assert numbers == ["8E0121251", "8E0121251A", "8E0121251AF"]


def test_foreign_number_requires_the_requested_vehicle_make():
    adapter = NrfAdapter(FakeHttp())  # type: ignore[arg-type]
    found = adapter.lookup_foreign(LookupRequest("Audi", "8E0 121 251", "oem"))

    assert [(r.to.brand, r.to.number, r.direction) for r in found.relationships] == [
        ("NRF", "50539", "incoming")
    ]
    assert adapter.lookup_foreign(LookupRequest("Toyota", "8E0 121 251", "oem")).is_empty
    assert adapter.lookup_foreign(LookupRequest("Audi", "8E0", "oem")).is_empty


def test_unknown_or_partial_own_number_is_not_accepted():
    result, _ = lookup("5053")

    assert result.is_empty


def test_result_matches_schema_and_adapter_is_registered():
    adapter = NrfAdapter(FakeHttp())  # type: ignore[arg-type]
    result = run_lookup([adapter], LookupRequest("NRF", "50539", "aftermarket"), "w", load_schema())

    assert result.sources[0]["name"] == "NRF (каталог виробника)"
    assert result.errors == []
    assert NrfAdapter in ADAPTERS
