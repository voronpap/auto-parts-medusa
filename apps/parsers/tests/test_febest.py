from __future__ import annotations

from pathlib import Path

from parsers.adapters import LookupRequest
from parsers.adapters.febest import FebestAdapter, parse_list, parse_product_page, split_vehicle
from parsers.worker import load_schema, run_lookup

FIXTURES = Path(__file__).parent / "fixtures"


def page(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


class FakeHttp:
    """Serves saved pages by address; records what was asked."""

    def __init__(self):
        self.urls: list[str] = []

    def fetch(self, url, **kwargs):
        self.urls.append(url)

        if "?oem=" in url or "?code=" in url:
            return page("febest_search_02606_001.html")

        if "1512_001" in url:
            return page("febest_1512_001.html")

        return page("febest_02606_001.html")


def lookup(number="02606-001"):
    http = FakeHttp()
    return FebestAdapter(http).lookup(LookupRequest("Febest", number, "aftermarket")), http  # type: ignore[arg-type]


def test_product_is_found_by_its_code_through_the_search():
    result, http = lookup("02606 001")

    assert not result.is_empty
    assert http.urls == [
        "https://febest.de/en/catalog?code=02606%20001",
        "https://febest.de/en/details/abs_sensor_front-02606_001",
    ]


def test_vehicles_become_fitment_with_years_and_market():
    result, _ = lookup()
    first = result.applications[0]

    assert (first.make, first.model, first.year_from, first.year_to, first.market) == (
        "NISSAN", "ROGUE S35", 2007, 2015, "CA",
    )
    assert first.raw_text == "NISSAN ROGUE S35 2007.08-2015.11 [CA]"
    assert {a.make for a in result.applications} == {"NISSAN", "RENAULT"}
    # An open-ended period has no last year.
    assert any(a.year_to is None and a.raw_text.endswith("2007.09- [AR]") for a in result.applications)


def test_oe_number_of_a_part_fitting_several_makes_is_marked_for_review():
    result, _ = lookup()
    crosses = [(r.to.brand, r.to.number, r.relation_type, r.ambiguous) for r in result.relationships]

    assert crosses == [
        ("NISSAN", "47910-JG000", "OEM_REFERENCE", True),
        ("RENAULT", "47910-JG000", "OEM_REFERENCE", True),
    ]
    assert "NISSAN, RENAULT" in result.relationships[0].reason


def test_vehicle_without_months_or_market_is_read_too():
    _, result, numbers = parse_product_page(page("febest_1512_001.html"), "u")

    assert numbers == [("T11-2203040BC", False)]
    assert [(a.make, a.model, a.year_from, a.year_to) for a in result.applications] == [
        ("CHERY", "TIGGO T11", 2006, 2013),
        ("VORTEX", "TINGO", 2006, 2013),
    ]


def test_assembly_number_is_not_an_equivalent():
    html = page("febest_1512_001.html").replace(
        '<option value="T11-2203040BC">T11-2203040BC</option>',
        '<option value="#T11-2203040BC">#T11-2203040BC</option>',
    )
    _, result, numbers = parse_product_page(html, "u")

    assert numbers == [("T11-2203040BC", True)]
    assert {(r.relation_type, r.direction, r.to.number) for r in result.relationships} == {
        ("CONTAINS", "incoming", "T11-2203040BC")
    }


def test_two_word_makes_are_kept_whole():
    assert split_vehicle("GREAT WALL HOVER H5") == ("GREAT WALL", "HOVER H5")
    assert split_vehicle("CHERY TIGGO T11") == ("CHERY", "TIGGO T11")


def test_list_page_gives_one_row_per_product():
    assert parse_list(page("febest_search_02606_001.html")) == [
        ("02606-001", "https://febest.de/en/details/abs_sensor_front-02606_001")
    ]


def test_code_that_only_starts_the_same_is_not_a_match():
    result, _ = lookup("02606-00")

    assert result.is_empty


def test_oe_number_finds_the_part_for_a_maker_it_fits():
    adapter = FebestAdapter(FakeHttp())  # type: ignore[arg-type]
    found = adapter.lookup_foreign(LookupRequest("Nissan", "47910JG000", "oem"))

    assert [(r.to.brand, r.to.number, r.relation_type, r.direction) for r in found.relationships] == [
        ("FEBEST", "02606-001", "OEM_REFERENCE", "incoming")
    ]
    # The part does not fit any Toyota, so the number is not taken as Toyota's.
    assert adapter.lookup_foreign(LookupRequest("Toyota", "47910JG000", "oem")).is_empty
    assert adapter.lookup_foreign(LookupRequest("Nissan", "4791", "oem")).is_empty


def test_result_matches_the_catalog_schema():
    adapter = FebestAdapter(FakeHttp())  # type: ignore[arg-type]
    result = run_lookup([adapter], LookupRequest("FEBEST", "02606-001", "aftermarket"), "w", load_schema())

    assert result.sources[0]["name"] == "FEBEST (каталог виробника)"
    assert result.errors == []
