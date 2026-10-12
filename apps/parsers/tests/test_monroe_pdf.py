from __future__ import annotations

import json
from pathlib import Path

from parsers.pdf import monroe
from parsers.pdf.layout import Line

FIXTURES = Path(__file__).parent / "fixtures"


def page(number: int) -> list[Line]:
    rows = json.loads((FIXTURES / f"monroe_p{number}.json").read_text(encoding="utf-8"))
    return [Line(*row) for row in rows]


def fitments(number: int, model: str, **kwargs):
    result = monroe.parse_page(page(number), number, **kwargs)
    return [f for f in result.fitments if f.application.model == model]


def brief(items):
    return [(f.part_number, f.application.position, f.application.engine) for f in items]


def test_front_and_rear_come_from_the_column_not_the_reading_order():
    # Pixo lists a single shock; only its column says it is the rear one.
    assert brief(fitments(274, "PIXO (UA0)")) == [("G1246", "rear", None)]
    assert brief(fitments(274, "PICK UP (D21)")) == [
        ("D4462S", "front", None),
        ("D4463S", "rear", None),
        ("D2113S", "front", None),
        ("D4463S", "rear", None),
    ]


def test_vehicle_header_gives_model_years_and_drive():
    first = fitments(274, "PICK UP (D21)")[0].application

    assert (first.make, first.year_from, first.year_to, first.drivetrain) == ("NISSAN", 1985, 2008, "AWD")
    assert fitments(274, "PIXO (UA0)")[0].application.year_to is None


def test_parts_apply_to_the_engine_group_they_sit_in():
    items = fitments(274, "PRIMERA P11 Hatch / Saloon")
    rear = {(f.part_number, f.application.engine) for f in items if f.application.position == "rear"}

    # The first five engines take 23868 at the rear, the LPG group 23895.
    assert ("23868", "1.6 16V(66;73;78kW)") in rear
    assert ("23895", "1.6 16V LPG(78kW)") in rear
    assert ("23868", "1.6 16V LPG(78kW)") not in rear
    assert len(items) == 20


def test_engine_years_and_power():
    items = {f.application.engine: f.application for f in fitments(274, "PRIMERA P11 Hatch / Saloon")}

    assert (items["2.0(140kW)"].year_from, items["2.0(140kW)"].year_to) == (1996, 1999)
    assert items["2.0(140kW)"].power_kw == 140
    # Several outputs on one line: none is singled out.
    assert items["1.6 16V(66;73;78kW)"].power_kw is None


def test_restriction_notes_become_constraints():
    items = fitments(274, "PRIMERA P11 Hatch / Saloon")
    noted = [f for f in items if f.application.engine == "2.0 TD(66kW)" and f.application.position == "front"]

    assert noted[0].application.constraints == {"raw": "-GT, SRi"}
    assert fitments(274, "PIXO (UA0)")[0].application.constraints is None


def test_date_arrows_are_spelled_out_and_icons_dropped():
    assert monroe.clean_note("09.11 ╩") == "from 09.11"
    assert monroe.clean_note("╦ 03.79") == "until 03.79"
    assert monroe.clean_note("♪ ═Ù") == ""
    assert monroe.clean_note("Grand Voyager +AK071") == "Grand Voyager +AK071"


def test_wrapped_engine_name_is_joined():
    engines = {f.application.engine for f in fitments(274, "QASHQAI II SUV (J11, J11_)")}

    assert engines == {"1.6 dCi ALL MODE 4x4-i(96kW)"}


def test_other_versions_marker_is_a_restriction_not_an_engine():
    items = fitments(12, "156 Sportwagon (932_)")

    assert ("45009", "front", None) in brief(items)
    assert ("G8350", "rear", "3.2 GTA(184kW)") in brief(items)
    general = next(f for f in items if f.part_number == "45009")
    assert general.application.constraints == {"raw": monroe.OTHER_VERSIONS_NOTE}


def test_a_make_can_start_in_the_middle_of_a_page():
    result = monroe.parse_page(page(60), 60)
    makes = {f.application.model: f.application.make for f in result.fitments}

    assert result.make == "CHRYSLER"
    assert makes["YPSILON"] == "CHRYSLER"
    assert makes["2 CV"] == "CITROËN"
    assert result.last_vehicle.make == "CITROËN"


def test_column_titles_are_not_makes():
    assert {f.application.make for f in monroe.parse_page(page(12), 12).fitments} == {"ALFA ROMEO"}


def test_only_numbers_from_the_catalogue_index_count_as_parts():
    known = monroe.index_part_numbers(page(509))

    assert "G21632" in known and "VOLVO" not in known
    assert brief(fitments(274, "PIXO (UA0)", known_parts={"D4462S"})) == []


def test_record_points_at_the_page():
    application = fitments(274, "PIXO (UA0)")[0].application

    assert application.record_ref.endswith("p. 274")
    assert application.raw_text.startswith("NISSAN PIXO (UA0) 03.2009")


def test_a_standalone_note_is_not_a_make_unless_the_catalogue_names_it():
    lines = page(60)
    known = {"CHRYSLER", "CITROËN"}
    makes = {f.application.make for f in monroe.parse_page(lines, 60, known_makes=known).fitments}

    assert makes == known
    only = {f.application.make for f in monroe.parse_page(lines, 60, known_makes={"CHRYSLER"}).fitments}
    assert only == {"CHRYSLER"}
