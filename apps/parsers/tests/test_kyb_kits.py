from __future__ import annotations

import json
from pathlib import Path

from parsers.pdf import kyb_kits
from parsers.pdf.layout import Line

FIXTURES = Path(__file__).parent / "fixtures"


def page(number: int) -> list[Line]:
    rows = json.loads((FIXTURES / f"kyb_p{number}.json").read_text(encoding="utf-8"))
    return [Line(*row) for row in rows]


def targets(records):
    return [(r["to"]["brand"], r["to"]["number"]) for r in records]


def test_kit_page_gives_oe_numbers_under_the_stated_make():
    kits = kyb_kits.parse_kit_page(page(564), 564)

    assert targets(kits["SM1529"])[:3] == [
        ("Renault", "7700424482"),
        ("Renault", "7701207350"),
        ("Renault", "7701208419"),
    ]
    assert all(r["relation_type"] == "OEM_REFERENCE" and "ambiguous" not in r for r in kits["SM1529"])
    assert kits["SM1529"][0]["record_ref"] == "page 564"


def test_number_listed_for_several_makes_is_marked_for_review():
    kits = kyb_kits.parse_kit_page(page(564), 564)
    first = kits["SM1526"][:2]

    assert targets(first) == [("Nissan", "54321AX600"), ("Renault", "54321AX600")]
    assert all(r["ambiguous"] and "Nissan, Renault" in r["reason"] for r in first)


def test_list_continued_in_a_second_column_stays_with_its_kit():
    kits = kyb_kits.parse_kit_page(page(587), 587)
    numbers = {number for _, number in targets(kits["SM9930"])}

    # First column, then the continuation beside it.
    assert {"4180051KA0", "4181257K00", "4181263J00", "93193098"} <= numbers
    # The make wraps over two lines.
    assert {brand for brand, _ in targets(kits["SM9930"])} == {"Opel", "Suzuki", "Vauxhall"}
    assert "487550F010" not in numbers


def test_catalogue_spellings_of_makes_are_brought_to_catalog_names():
    kits = kyb_kits.parse_kit_page(page(587), 587)

    assert {brand for brand, _ in targets(kits["SM9939"])} == {"Seat", "VW"}
    assert kyb_kits._makes("Chevrolet (GM), Chevrolet - Daewoo") == ["Chevrolet", "Daewoo"]


def test_alternative_numbers_supersede_and_the_rest_are_discontinued():
    found = kyb_kits.parse_pages({588: page(588)})

    assert [(r["relation_type"], r["to"]["number"]) for r in found["332504"]] == [("SUPERSEDED_BY", "3320035")]
    assert found["910036"][0]["to"] == {"brand": "KYB", "number_type": "aftermarket", "number": "910353"}
    assert found["243025"] == [
        {
            "to": None,
            "relation_type": "DISCONTINUED_NO_REPLACEMENT",
            "raw_relation_text": "Discontinued PN",
            "record_ref": "page 588",
        }
    ]


def test_other_pages_state_nothing():
    assert kyb_kits.parse_pages({40: page(40)}) == {}
