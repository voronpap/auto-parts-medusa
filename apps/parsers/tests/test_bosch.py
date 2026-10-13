from __future__ import annotations

import json
from pathlib import Path

from parsers.adapters import LookupRequest
from parsers.adapters.bosch import BoschAdapter
from parsers.worker import load_schema, run_lookup

FIXTURES = Path(__file__).parent / "fixtures"
NUMBER = "0986424797"


def fixture(name: str):
    return json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))


class FakeHttp:
    """Serves saved service responses; records the paths that were asked."""

    def __init__(self):
        self.paths: list[str] = []

    def fetch_json(self, url, params=None, **kwargs):
        path = url.split("/ps/api/uk/ua", 1)[1]
        self.paths.append(path)

        if path.startswith("/search/"):
            return fixture("bosch_search_0986424797" if NUMBER in path else "bosch_search_none")

        if path.startswith("/search-details/"):
            return fixture("bosch_details_0986424797")

        if path.endswith("/makers"):
            return fixture("bosch_makers_0986424797")

        if path.endswith("/vehicles/SKO"):
            return fixture("bosch_vehicles_0986424797_SKO")

        return {"vehicles": []}


def lookup(number: str = "0 986 424 797", brand: str = "Bosch"):
    http = FakeHttp()
    return BoschAdapter(http).lookup(LookupRequest(brand, number, "aftermarket")), http  # type: ignore[arg-type]


def test_number_is_found_however_it_is_spaced():
    result, http = lookup("0 986 424 797")

    assert not result.is_empty
    assert http.paths[0] == f"/search/{NUMBER}"


def test_oe_numbers_keep_the_catalogue_spelling_and_the_make_alias_is_dropped():
    result, _ = lookup()
    oe = [r for r in result.relationships if r.relation_type == "OEM_REFERENCE"]

    assert len(oe) == 64
    assert ("AUDI", "1K0 698 151 C") in {(r.to.brand, r.to.number) for r in oe}
    assert {r.to.brand for r in oe} == {"AUDI", "SEAT", "SKODA", "VW"}
    assert all(r.to.number_type == "oem" for r in oe)


def test_recommended_accessories_are_accessories_for_this_product():
    result, _ = lookup()
    accessories = [r for r in result.relationships if r.relation_type == "ACCESSORY_FOR"]

    assert {r.to.number for r in accessories} >= {"1987474451", "1987474408"}
    assert all(r.direction == "incoming" and r.to.brand == "Bosch" for r in accessories)


def test_specifications_become_attributes_without_the_article_row():
    result, _ = lookup()
    attributes = {a.name: a.value for a in result.attributes}

    assert attributes["Ширина 1 (коротша)"] == "155,2 mm"
    assert attributes["Назва"].startswith("Гальмова накладка")
    assert "Артикул" not in attributes
    assert "Рекомендовані приналежності" not in attributes


def test_vehicles_become_structured_fitment():
    result, _ = lookup()
    fabia = next(
        a for a in result.applications if a.model == "Fabia" and a.engine == "1.0 MPI" and a.engine_code == "CHYA"
    )

    assert (fabia.make, fabia.generation, fabia.power_kw) == ("SKODA", "NJ3", 44.0)
    assert (fabia.year_from, fabia.year_to) == (2014, 2021)
    assert fabia.raw_text.startswith("SKODA Fabia 1.0 MPI | NJ3 | CHYA | 44 kW | 08.2014 - 06.2021")
    assert fabia.constraints is None


def test_only_makers_listing_this_number_are_asked_for_vehicles():
    result, http = lookup()
    vehicle_calls = [path for path in http.paths if "/vehicles/" in path]

    assert sorted(path.rsplit("/", 1)[1] for path in vehicle_calls) == ["AUD", "SEA", "SKO", "VWW"]
    assert len(result.applications) == 207


def test_open_ended_production_has_no_end_year():
    result, _ = lookup()

    assert any(a.year_to is None for a in result.applications)


def test_unknown_number_gives_an_empty_result_after_one_request():
    result, http = lookup("ZZZNOPE000")

    assert result.is_empty
    assert len(http.paths) == 1


def test_result_matches_the_catalog_schema():
    http = FakeHttp()
    adapter = BoschAdapter(http)  # type: ignore[arg-type]
    result = run_lookup([adapter], LookupRequest("BOSCH", NUMBER, "aftermarket"), "w", load_schema())

    assert result.sources[0]["name"] == "Bosch (каталог виробника)"
    assert result.errors == []


def test_another_makers_number_finds_the_bosch_products_that_reference_it():
    class OeSearch(FakeHttp):
        def fetch_json(self, url, params=None, **kwargs):
            path = url.split("/ps/api/uk/ua", 1)[1]

            if path.startswith("/search/"):
                self.paths.append(path)
                return {"products": [{"productNumber": NUMBER}, {"productNumber": ""}]}

            return super().fetch_json(url, params=params, **kwargs)

    http = OeSearch()
    adapter = BoschAdapter(http)  # type: ignore[arg-type]
    result = adapter.lookup_foreign(LookupRequest("Audi", "1K0698151C", "oem"))

    assert [(r.to.brand, r.to.number, r.relation_type, r.direction) for r in result.relationships] == [
        ("Bosch", NUMBER, "OEM_REFERENCE", "incoming")
    ]
    assert result.relationships[0].raw_relation_text.endswith("1K0 698 151 C")
    assert http.paths == ["/search/1K0698151C", f"/search-details/{NUMBER}"]
    # The same number under a maker the table does not name is not a match.
    assert adapter.lookup_foreign(LookupRequest("Toyota", "1K0698151C", "oem")).is_empty
    assert adapter.lookup_foreign(LookupRequest("Audi", "1K0", "oem")).is_empty
