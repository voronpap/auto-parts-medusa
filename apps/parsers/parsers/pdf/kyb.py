"""KYB shock absorber catalogue (PDF, 2022 version A).

Application pages are one table: model, chassis code and production dates on
the left, then front and rear shock absorbers, each split into the Premium,
Excel-G and Gas-A-Just lines. This module turns the pages into fitment
records per KYB part number.

Only what the page states is recorded. The catalogue marks fuel, body and
product types with an icon font whose meaning the text layer does not carry;
such symbols are never interpreted, and a row carrying one is recorded as
restricted so that it is reviewed rather than taken as unconditional.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from ..models import Application
from .layout import Line

PARSER_VERSION = "1.0.0"
CATALOG_VERSION = "2022 Version A"
PDF_URL = (
    "https://kyb-europe.com/wp-content/uploads/2022/06/"
    "KYB-Shock-Absorber-Catalogue-2022-Version-A-ENG.pdf"
)
FILE_NAME = "KYB-Shock-Absorber-Catalogue-2022-Version-A-ENG.pdf"

APPLICATION_PAGES = (33, 435)
PAGE_MARKER = "FRONT/VORNE/AVANT"

# Column bands (PDF points from the left edge), measured on the pages.
LEFT_MAX_X = 60
CHASSIS_X = (110, 178)
YEAR_FROM_X = (176, 207)
YEAR_TO_X = (207, 228)
COLUMNS = {
    ("front", "Premium"): (228, 271),
    ("front", "Excel-G"): (271, 319),
    ("front", "Gas-A-Just"): (319, 367),
    ("rear", "Premium"): (390, 433),
    ("rear", "Excel-G"): (433, 481),
    ("rear", "Gas-A-Just"): (481, 529),
}
KIT_X = (228, 529)
CONTENT_Y = (40, 725)

MAKE_SIZE = 14.0
MODEL_SIZE = 11.0
TEXT_SIZE = 8.5
ICON_FONT_PREFIX = "KYB"
# The icon standing for "all versions"; any other icon narrows the row.
ALL_VERSIONS_ICON = "7"

YEAR_FROM_RE = re.compile(r"^(?:(?P<month>\d{1,2})\.)?(?P<year>\d\d)\s*-(?:\s*(?:(?P<to_month>\d{1,2})\.)?(?P<to_year>\d\d))?$")
YEAR_TO_RE = re.compile(r"^(?:(?P<month>\d{1,2})\.)?(?P<year>\d\d)$")
PART_RE = re.compile(r"^(?P<number>\d{6,7})(?:(?P<footnote>\d)\))?(?:\s+(?P<side>[LR]))?(?:\s+[a-zA-Z])?$")
RESTRICTION_RE = re.compile(r"^(?:Exc|Incl|I\s?ncl|V\s|With|Without|Only)\b|sus\.", re.I)


@dataclass
class Fitment:
    part_number: str
    page: int
    application: Application


@dataclass
class PageResult:
    fitments: list[Fitment] = field(default_factory=list)
    make: str | None = None
    last_model: str | None = None


def _year(value: str | None) -> int | None:
    if value is None:
        return None

    year = int(value)

    return 2000 + year if year <= 40 else 1900 + year


def _in(band: tuple[float, float], x: float) -> bool:
    return band[0] <= x < band[1]


def _sized(line: Line, size: float) -> bool:
    return abs(line.size - size) < 0.3


def page_make(lines: list[Line]) -> str | None:
    makes = [
        line
        for line in lines
        if CONTENT_Y[0] <= line.y <= CONTENT_Y[1]
        and _sized(line, MAKE_SIZE)
        and line.x0 <= LEFT_MAX_X
        and not line.font.startswith(ICON_FONT_PREFIX)
    ]

    return clean_make(max(makes, key=lambda line: line.y).text) if makes else None


def _is_icon(line: Line) -> bool:
    return line.font.startswith(ICON_FONT_PREFIX)


def clean_make(text: str) -> str:
    """ "Renault (F)" -> "Renault": the bracket is the country of origin."""
    return re.sub(r"\s*\([A-Z]{1,3}\)\s*$", "", text).strip()


def clean_model(text: str) -> str:
    """Drops the body-type icons that trail a model name ("Espace IV  I")."""
    return re.sub(r"\s{2,}[A-Za-z0-9](?=\s*,|\s{2,}|\s*$)", "", text).strip(" ,")


def split_model(text: str) -> tuple[str, str | None]:
    """Model name and the restriction some headings carry after it.

    "Laguna I  B  Exc. p" -> ("Laguna I", "Exc. p").
    """
    cleaned = clean_model(text)
    parts = re.split(r"\s{2,}(?=(?:Exc|Incl)\.)", cleaned, maxsplit=1)

    return parts[0].strip(), (parts[1].strip() if len(parts) > 1 else None)


FOOTNOTE_LINE_RE = re.compile(r"^\d\)")
# Parts and kits of a row sit at or below its date, give or take a cell's
# vertical centring; descriptive text sits around it.
ROW_SLACK = 6


def is_application_page(lines: list[Line]) -> bool:
    return any(line.text == PAGE_MARKER for line in lines)


def parse_page(lines: list[Line], page: int, carried_model: str | None = None) -> PageResult:
    """Fitment records on one application page.

    `carried_model` is the model whose rows continue from the previous page.
    """
    result = PageResult()
    body = sorted(
        (line for line in lines if CONTENT_Y[0] <= line.y <= CONTENT_Y[1]),
        key=lambda line: (-line.y, line.x0),
    )
    result.make = page_make(lines)

    if not result.make:
        return result

    models = [
        line
        for line in body
        if _sized(line, MODEL_SIZE) and line.x0 <= LEFT_MAX_X and not _is_icon(line)
    ]
    rows = [
        (line, YEAR_FROM_RE.match(line.text))
        for line in body
        if _in(YEAR_FROM_X, line.x0) and YEAR_FROM_RE.match(line.text)
    ]

    def heading_of(y: float) -> Line | None:
        above = [line for line in models if line.y > y]
        return min(above, key=lambda line: line.y) if above else None

    # Descriptive text belongs to the nearest row of the same model: a
    # multi-line description is centred on its row, not hung below the date.
    described: dict[int, list[Line]] = {index: [] for index in range(len(rows))}

    for line in body:
        if line.x0 > CHASSIS_X[1] or FOOTNOTE_LINE_RE.match(line.text):
            continue

        if _sized(line, MODEL_SIZE) or _sized(line, MAKE_SIZE):
            if not _is_icon(line):
                continue

        heading = heading_of(line.y)
        candidates = [
            index for index, (year_line, _) in enumerate(rows) if heading_of(year_line.y) is heading
        ]

        if candidates:
            nearest = min(candidates, key=lambda index: abs(rows[index][0].y - line.y))
            described[nearest].append(line)

    for index, (year_line, year_match) in enumerate(rows):
        row_top = year_line.y + ROW_SLACK
        # Parts down to the next row or the next model heading are this row's.
        lower_bounds = [line.y for line, _ in rows[index + 1 : index + 2]]
        lower_bounds += [line.y for line in models if line.y < year_line.y - 3]
        row_bottom = (max(lower_bounds) + ROW_SLACK) if lower_bounds else CONTENT_Y[0]

        heading = heading_of(year_line.y)
        model, model_note = split_model(heading.text) if heading else (carried_model, None)

        if not model:
            continue

        inside = [line for line in body if row_bottom < line.y <= row_top]
        year_to_lines = [line for line in inside if _in(YEAR_TO_X, line.x0) and abs(line.y - year_line.y) <= 3]
        to_match = YEAR_TO_RE.match(year_to_lines[0].text) if year_to_lines else None
        year_from = _year(year_match.group("year"))
        year_to = _year(to_match.group("year")) if to_match else _year(year_match.group("to_year"))
        about = described[index]
        chassis = " ".join(
            line.text for line in about if _in(CHASSIS_X, line.x0) and line.text.startswith("(")
        )
        icons = [line.text for line in about if _is_icon(line) and line.x0 <= LEFT_MAX_X]
        texts = [
            line.text
            for line in about
            if line.x0 <= LEFT_MAX_X and _sized(line, TEXT_SIZE) and not _is_icon(line)
        ]
        engines = " ".join(text for text in texts if not RESTRICTION_RE.search(text))
        restrictions = ([model_note] if model_note else []) + [
            text for text in texts if RESTRICTION_RE.search(text)
        ]
        narrowing = [icon for icon in icons if icon != ALL_VERSIONS_ICON]

        if narrowing:
            restrictions.append(f"catalogue symbol {' '.join(narrowing)}")

        kits = " ".join(
            line.text
            for line in inside
            if _in(KIT_X, line.x0) and re.match(r"^[A-Za-z] (?:\d|[A-Z]{2}\d)", line.text)
        )

        for (position, product_line), band in COLUMNS.items():
            for line in inside:
                match = PART_RE.match(line.text) if _in(band, line.x0) and not _is_icon(line) else None

                if not match:
                    continue

                notes = list(restrictions)

                if match.group("footnote"):
                    notes.append(f"footnote {match.group('footnote')} on p. {page}")

                side = {"L": "left", "R": "right"}.get(match.group("side") or "")
                raw = " | ".join(
                    piece
                    for piece in (
                        f"{result.make} {model}",
                        chassis,
                        year_line.text + (f" {year_to_lines[0].text}" if year_to_lines else ""),
                        engines,
                        f"{position} {product_line}" + (f" {side}" if side else ""),
                        kits,
                        "; ".join(notes),
                    )
                    if piece
                )
                result.fitments.append(
                    Fitment(
                        part_number=match.group("number"),
                        page=page,
                        application=Application(
                            make=result.make,
                            model=model,
                            generation=chassis or None,
                            year_from=year_from,
                            year_to=year_to,
                            engine=engines or None,
                            position=position,
                            side=side,
                            constraints={"raw": "; ".join(notes)} if notes else None,
                            raw_text=re.sub(r"\s+", " ", raw)[:2000],
                            record_ref=f"{FILE_NAME}, p. {page}",
                            record_url=PDF_URL,
                        ),
                    )
                )

    if models:
        result.last_model = split_model(min(models, key=lambda line: line.y).text)[0]
    else:
        result.last_model = carried_model

    return result


def build(pdf_path, progress=None, lines_cache=None) -> dict[str, list[Fitment]]:
    """Reads the whole catalogue into fitment records per part number."""
    import dataclasses
    import json
    from pathlib import Path

    from .layout import page_lines

    cache = Path(lines_cache) if lines_cache else None

    if cache and cache.exists():
        pages = {
            int(number): [Line(*row) for row in rows]
            for number, rows in json.loads(cache.read_text(encoding="utf-8")).items()
        }
    else:
        pages = {}

        for number, lines in page_lines(pdf_path, list(range(APPLICATION_PAGES[0], APPLICATION_PAGES[1] + 1))):
            pages[number] = lines

            if progress:
                progress(number, 0)

        if cache:
            cache.parent.mkdir(parents=True, exist_ok=True)
            cache.write_text(
                json.dumps({n: [dataclasses.astuple(line) for line in lines] for n, lines in pages.items()}, ensure_ascii=False),
                encoding="utf-8",
            )

    fitments: dict[str, list[Fitment]] = {}
    carried: str | None = None
    previous_make: str | None = None

    for number in sorted(pages):
        lines = pages[number]

        if not is_application_page(lines):
            continue

        # A model does not continue across a change of make.
        make = page_make(lines)
        result = parse_page(lines, number, carried_model=carried if make == previous_make else None)
        carried = result.last_model
        previous_make = make

        for fitment in result.fitments:
            fitments.setdefault(fitment.part_number, []).append(fitment)

    return fitments
