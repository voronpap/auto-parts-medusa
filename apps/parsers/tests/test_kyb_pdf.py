from __future__ import annotations

import json
from pathlib import Path

from parsers.pdf import kyb
from parsers.pdf.layout import Line

FIXTURES = Path(__file__).parent / "fixtures"


def page(number: int) -> list[Line]:
    rows = json.loads((FIXTURES / f"kyb_p{number}.json").read_text(encoding="utf-8"))
    return [Line(*row) for row in rows]


def fitments(number: int, model: str):
    return [f for f in kyb.parse_page(page(number), number).fitments if f.application.model == model]


def brief(items):
    return [(f.part_number, f.application.position, f.application.side) for f in items]


def test_make_and_model_headings_are_cleaned_of_icons_and_country():
    result = kyb.parse_page(page(296), 296)

    assert result.make == "Renault"
    assert {f.application.model for f in result.fitments} >= {"Espace IV", "Fluence", "Kadjar", "Koleos", "Laguna I"}
    assert kyb.clean_model("A1 (8X1, 8XK)  A  J, A1 Sportback (8XA, 8XF)  A  L") == (
        "A1 (8X1, 8XK), A1 Sportback (8XA, 8XF)"
    )


def test_front_rear_and_side_come_from_columns_and_suffixes():
    assert brief(fitments(296, "Koleos")) == [
        ("339199", "front", "left"),
        ("339198", "front", "right"),
        ("349078", "rear", None),
        ("5540008", "rear", None),
    ]


def test_years_and_chassis_code():
    rows = fitments(296, "Espace IV")
    first, second = rows[0].application, rows[3].application

    assert (first.year_from, first.year_to, first.generation) == (2002, 2006, "(JK0/1_)")
    assert (second.year_from, second.year_to) == (2006, None)


def test_row_restrictions_become_constraints():
    assert fitments(296, "Espace IV")[0].application.constraints == {"raw": "Exc. f, Self Leveling"}
    assert fitments(296, "Koleos")[0].application.constraints is None


def test_description_of_a_row_is_not_mistaken_for_a_restriction():
    variants = {f.application.engine for f in fitments(296, "Fluence")}

    assert variants == {None, "Z.E."}


def test_footnote_marker_is_split_from_the_number_and_recorded():
    rear = [f for f in fitments(296, "Kadjar") if f.application.position == "rear"]

    assert [f.part_number for f in rear] == ["349078", "3448029", "349078"]
    assert "footnote 1 on p. 296" in rear[0].application.constraints["raw"]
    assert "footnote 2 on p. 296" in rear[1].application.constraints["raw"]


def test_icon_symbols_are_not_interpreted_but_make_the_row_restricted():
    front = [f for f in fitments(296, "Kadjar") if f.application.position == "front"]

    assert {f.application.constraints["raw"] for f in front} == {
        "catalogue symbol M",
        "catalogue symbol N",
    }


def test_restriction_in_a_model_heading_applies_to_its_rows():
    laguna = fitments(296, "Laguna I")

    assert laguna and all("Exc. p" in f.application.constraints["raw"] for f in laguna)
    assert kyb.split_model("Laguna I  B  Exc. p") == ("Laguna I", "Exc. p")


def test_footnote_lines_are_not_row_text():
    assert all(f.application.engine != "1)" for f in kyb.parse_page(page(296), 296).fitments)


def test_record_points_at_the_page():
    application = fitments(296, "Koleos")[0].application

    assert application.record_ref.endswith("p. 296")
    assert application.raw_text.startswith("Renault Koleos")


def test_make_headings_are_reduced_to_the_make():
    assert kyb.clean_make("Ford (Europe)") == "Ford"
    assert kyb.clean_make("Citroën Commercial") == "Citroën"
    assert kyb.clean_make("Lada (VAZ)") == "Lada"
    assert kyb.clean_make("Hillman (GB) l Talbot (F)") == "Talbot"
    assert kyb.clean_make("Chrysler - Dodge - Plymouth") == "Chrysler - Dodge - Plymouth"


def test_icons_before_a_bracket_are_dropped_from_the_model():
    assert kyb.clean_model("Transit  S (06- )") == "Transit (06- )"
