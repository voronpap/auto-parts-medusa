from __future__ import annotations

from pathlib import Path

from parsers.adapters import LookupRequest
from parsers.adapters.spareto import SparetoAdapter, parse_cards, parse_product_page
from parsers.worker import load_schema, run_lookup

FIXTURES = Path(__file__).parent / "fixtures"


def page(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


class FakeHttp:
    def __init__(self):
        self.urls: list[str] = []

    def fetch(self, url, **kwargs):
        self.urls.append(url)

        if "/oe/" in url:
            return page("spareto_oe_06a115561b.html")

        if "keywords=" in url:
            return page("spareto_search_0451103314.html")

        return page("spareto_bosch_0451103314.html")


def lookup(brand="Bosch", number="0 451 103 314"):
    http = FakeHttp()
    return SparetoAdapter(http).lookup(LookupRequest(brand, number, "aftermarket")), http  # type: ignore[arg-type]


def test_product_is_found_among_its_analogs_by_brand_and_number():
    result, http = lookup()

    assert not result.is_empty
    assert http.urls == [
        "https://spareto.com/products?keywords=0451103314",
        "https://spareto.com/products/bosch-oil-filter/0-451-103-314",
    ]


def test_number_under_another_brand_is_not_the_product():
    # The search page lists Bosch 0 451 103 314, not a MANN part of that number.
    assert lookup("MANN-FILTER")[0].is_empty
    assert lookup("Bosch", "0 451 103 31")[0].is_empty


def test_oe_numbers_keep_their_maker_and_spelling():
    result, _ = lookup()
    oe = {(r.to.brand, r.to.number) for r in result.relationships if r.relation_type == "OEM_REFERENCE"}

    assert {("AUDI", "06A 115 561 B"), ("VW", "1JM 115 561 BZ"), ("KUBOTA", "HH15332430")} <= oe
    assert all(r.to.number_type == "oem" for r in result.relationships if r.relation_type == "OEM_REFERENCE")


def test_cross_numbers_are_aftermarket_and_do_not_repeat_the_oe_list():
    result, _ = lookup()
    crosses = [(r.to.brand, r.to.number) for r in result.relationships if r.relation_type == "AFTERMARKET_CROSS"]

    assert ("FILTRON", "OP5261") in crosses
    # Site spellings are brought to the catalog's brand names.
    assert ("febi", "22550") in crosses and ("ALCO", "SP1137") in crosses
    # Vehicle makers' numbers from the cross list were already given as OE.
    assert not any(brand == "AUDI" for brand, _ in crosses)
    pairs = [(r.to.brand, r.to.number) for r in result.relationships]
    assert len(pairs) == len(set(pairs))


def test_specifications_ean_and_fitment_are_read():
    result, _ = lookup()
    attributes = {a.name: (a.value, a.unit) for a in result.attributes}

    assert attributes["Gasket outside diameter"] == ("72", "mm")
    assert attributes["EAN"] == ("3165143164129", None)
    assert attributes["Назва (англ.)"] == ("Oil filter", None)
    first = next(a for a in result.applications if a.make == "AUDI" and a.model == "A3")
    assert (first.year_from, first.year_to, first.raw_text) == (1996, 2013, "AUDI A3 1996 - 2013")
    assert {a.make for a in result.applications} == {"AUDI", "FORD", "SEAT", "SKODA", "VW"}


def test_maker_spelling_with_diacritics_is_the_same_maker():
    from parsers.adapters.base import label_has_brand
    from parsers.adapters.spareto import _brand

    assert _brand("LEMFÖRDER") == "LEMFORDER"
    assert label_has_brand(_brand("LEMFÖRDER"), "Lemforder")


def test_shop_is_registered_as_a_non_authoritative_source():
    source = SparetoAdapter(FakeHttp()).source  # type: ignore[arg-type]

    assert (source.kind, source.license_class, source.lineage) == ("open_database", "REFERENCE_ONLY", "tecdoc")


def test_oe_number_gives_the_products_listed_for_it():
    adapter = SparetoAdapter(FakeHttp())  # type: ignore[arg-type]
    found = adapter.lookup_foreign(LookupRequest("VW", "06A 115 561 B", "oem"))
    products = {(r.to.brand, r.to.number) for r in found.relationships}

    assert {("BOSCH", "0 451 103 314"), ("FILTRON", "OP 526/1"), ("febi", "22550")} <= products
    assert all(r.relation_type == "OEM_REFERENCE" and r.direction == "incoming" for r in found.relationships)
    # The page names its makers; Toyota is not one of them.
    assert adapter.lookup_foreign(LookupRequest("Toyota", "06A 115 561 B", "oem")).is_empty
    assert adapter.lookup_foreign(LookupRequest("VW", "06A 115 561", "oem")).is_empty


def test_cards_are_read_from_a_list_page():
    cards = parse_cards(page("spareto_search_0451103314.html"))

    assert cards[0] == ("BOSCH", "0 451 103 314", "https://spareto.com/products/bosch-oil-filter/0-451-103-314")


def test_result_matches_the_catalog_schema():
    adapter = SparetoAdapter(FakeHttp())  # type: ignore[arg-type]
    result = run_lookup([adapter], LookupRequest("BOSCH", "0451103314", "aftermarket"), "w", load_schema())

    assert result.sources[0]["name"] == "Spareto (магазин, довідкові дані)"
    assert result.errors == []


def test_page_without_reference_blocks_gives_only_what_it_has():
    brand, number, result = parse_product_page("<h1><span itemprop='mpn'>X 1</span></h1>", "u")

    assert (brand, number) == (None, "X 1")
    assert result.relationships == [] and result.applications == []


def test_bare_number_is_identified_by_its_own_cards_only():
    adapter = SparetoAdapter(FakeHttp())  # type: ignore[arg-type]

    # The search page also lists analogs (Blue Print, febi…); they are not this number.
    assert adapter.identify("0451103314") == [
        {"brand": "BOSCH", "number": "0 451 103 314", "title": "Oil filter"}
    ]
    assert adapter.identify("22550") == [{"brand": "febi", "number": "22550", "title": "Oil filter"}]
    assert adapter.identify("99") == []


def test_identification_survives_a_failing_source():
    from parsers.http import SourceError
    from parsers.worker import identify_number

    class Broken(SparetoAdapter):
        def identify(self, number):
            raise SourceError("down")

    result = identify_number([Broken(FakeHttp()), SparetoAdapter(FakeHttp())], "0451103314", "w")  # type: ignore[arg-type]

    assert [c["brand"] for c in result["candidates"]] == ["BOSCH"]
    assert result["candidates"][0]["source"] == "spareto"
    assert result["errors"] == [{"source": "spareto", "message": "down"}]


def test_catalogues_identify_a_number_no_shop_lists():
    from parsers.adapters import Adapter
    from parsers.models import Attribute, SourceMeta, SourceResult
    from parsers.worker import identify_number

    class Maker(Adapter):
        def __init__(self, brand, knows):
            self._brand, self._knows = brand, knows

        @property
        def source(self):
            return SourceMeta(key=self._brand.lower(), name=self._brand, kind="manufacturer_catalog", license_class="OPEN", lineage=self._brand)

        @property
        def brands(self):
            return (self._brand,)

        def lookup(self, request):
            result = SourceResult()

            if self._knows:
                result.attributes.append(Attribute(name="Назва", value="Термостат"))

            return result

    result = identify_number([Maker("AAA", False), Maker("KW", True)], " 457 001 ", "w")

    assert result["candidates"] == [{"brand": "KW", "number": "457 001", "title": "Термостат", "source": "kw"}]
