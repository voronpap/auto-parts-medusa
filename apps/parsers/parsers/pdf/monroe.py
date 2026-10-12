"""Monroe light-vehicle product catalogue (PDF, MNPRD2408).

Application pages list, per vehicle, the shock absorbers for the front axle
in one column and for the rear axle in another, optionally narrowed to
engines and with restriction notes beside the part. This module turns those
pages into fitment records per Monroe part number.

Only what the page states is recorded. A token is accepted as a part number
only if the catalogue's own numerical index lists it, and the icon-font
symbols whose meaning the text layer does not carry are ignored.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Iterable

from ..models import Application
from .layout import Line

PARSER_VERSION = "1.0.0"
CATALOG_VERSION = "MNPRD2408 (2024-09)"
PDF_URL = (
    "https://www.monroe.com/content/dam/marketing/emea/monroe/support/"
    "catalogues/Monroe_MNPRD2408_PDF_Product_Catalogue-LV_EN-LR.pdf"
)
FILE_NAME = "Monroe_MNPRD2408_PDF_Product_Catalogue-LV_EN-LR.pdf"

# Column bands (PDF points from the left edge), measured on the pages.
LEFT_MAX_X = 96
DATE_X = (178, 242)
COLUMNS = {
    "front": {"part": (236, 272), "kit": (270, 298), "note": (298, 400)},
    "rear": {"part": (421, 457), "kit": (455, 483), "note": (483, 586)},
}
CONTENT_Y = (58, 832)
TAB_MIN_X = 600  # the make's letters run down the page edge beyond this

# Lines of one engine group sit ~10.5pt apart; groups are further apart.
GROUP_GAP = 12.5
NEAR = 9.5  # a note or kit belongs to a part within this distance

HEADER_RE = re.compile(
    r"^(?P<model>.+?) (?P<from>\d\d\.\d{4}) -(?: (?P<to>\d\d\.\d{4}))?\s*"
    r"(?P<body>[A-Z]*)\s+(?P<drive>FWD|RWD|AWD)$"
)
ENGINE_DATE_RE = re.compile(r"^(?P<from>\d\d\.\d\d)?\s*ı\s*(?P<to>\d\d\.\d\d)?$")
POWER_RE = re.compile(r"\((?P<kw>\d+(?:;\d+)*)kW\)\s*$")
PART_RE = re.compile(r"^(?=[A-Z0-9]*\d)[A-Z0-9]{4,9}$")
KIT_RE = re.compile(r"^(?:MK|PK)\d{2,4}$")
COLUMN_TITLES = {"SHOCK", "MKPK", "SHOCK MKPK"}
MAKE_RE = re.compile(r"^[A-ZÀ-Ý][A-ZÀ-Ý .&'/-]{2,}$")

# Left-column markers drawn with an icon font: "s" stands for every version of
# the vehicle; "r" appears only beside vehicles that also list some engines
# separately, i.e. the remaining versions.
ALL_VERSIONS = "s"
OTHER_VERSIONS = "r"
OTHER_VERSIONS_NOTE = "versions not listed separately"


def clean_note(text: str) -> str:
    """Restriction text with the catalogue's date arrows spelled out.

    "09.11 ╩" is "from 09.11" and "╦ 03.79" is "until 03.79"; other
    icon glyphs carry no text and are dropped.
    """
    text = re.sub(r"(\d\d\.\d\d)\s*╩", lambda m: "from " + m.group(1), text)
    text = re.sub(r"╦\s*(\d\d\.\d\d)", lambda m: "until " + m.group(1), text)

    return " ".join(token for token in text.split() if re.search(r"[0-9A-Za-z]", token))


@dataclass
class Vehicle:
    make: str
    model: str
    year_from: int | None
    year_to: int | None
    body: str | None
    drive: str
    header: str


@dataclass
class Engine:
    name: str
    y_top: float
    y_bottom: float
    year_from: int | None = None
    year_to: int | None = None

    @property
    def power_kw(self) -> float | None:
        match = POWER_RE.search(self.name)

        # Several outputs share one line ("(66;73;78kW)"); none is singled out.
        if not match or ";" in match.group("kw"):
            return None

        return float(match.group("kw"))


@dataclass
class Fitment:
    part_number: str
    page: int
    application: Application


@dataclass
class PageResult:
    fitments: list[Fitment] = field(default_factory=list)
    last_vehicle: Vehicle | None = None
    make: str | None = None


def _short_year(value: str | None) -> int | None:
    """ "06.96" -> 1996, "11.13" -> 2013."""
    if not value:
        return None

    year = int(value.split(".")[1])

    return 2000 + year if year <= 40 else 1900 + year


def _in(band: tuple[float, float], x: float) -> bool:
    return band[0] <= x <= band[1]


def page_make(lines: Iterable[Line]) -> str | None:
    """The make printed in the page header."""
    candidates = [
        line
        for line in lines
        if line.y > CONTENT_Y[1]
        and len(line.text) > 1
        and re.fullmatch(r"[A-ZÀ-Ý0-9 .&'/-]+", line.text)
        and not line.text.isdigit()
    ]

    return max(candidates, key=lambda line: line.y).text if candidates else None


def index_part_numbers(lines: Iterable[Line]) -> set[str]:
    """Part numbers on a page of the catalogue's numerical index."""
    numbers: set[str] = set()

    for line in lines:
        for token in line.text.split():
            if PART_RE.match(token) and not KIT_RE.match(token):
                numbers.add(token)

    return numbers


@dataclass
class Group:
    """Engines one row of parts applies to, with the row's vertical extent."""

    high: float
    low: float
    members: list[tuple[Engine | None, bool]]  # (engine, is "other versions")

    def distance(self, y: float) -> float:
        if self.low - 2 <= y <= self.high + 2:
            return 0.0

        return min(abs(y - self.high), abs(y - self.low))


def index_make_words(lines: Iterable[Line]) -> set[str]:
    """Words of the make names on a page of the numerical index."""
    words: set[str] = set()

    for line in lines:
        for token in line.text.split():
            if re.fullmatch(r"[A-ZÀ-Ý][A-ZÀ-Ý.&'/-]+", token):
                words.add(token)

    return words


def _groups(left: list[Line], dates: list[Line]) -> list[Group]:
    """Engine groups of one vehicle block, top to bottom."""
    entries: list[tuple[float, float, Engine | None, bool]] = []
    pending: list[Line] = []

    for line in left:
        if line.text in (ALL_VERSIONS, OTHER_VERSIONS):
            entries.append((line.y, line.y, None, line.text == OTHER_VERSIONS))
            continue

        pending.append(line)

        # An engine name may wrap; it ends on the line carrying the power.
        if POWER_RE.search(line.text):
            name = " ".join(part.text for part in pending)
            engine = Engine(name, pending[0].y, pending[-1].y)

            for date in dates:
                if engine.y_bottom - 3 <= date.y <= engine.y_top + 3:
                    match = ENGINE_DATE_RE.match(date.text)

                    if match:
                        engine.year_from = _short_year(match.group("from"))
                        engine.year_to = _short_year(match.group("to"))

            entries.append((engine.y_top, engine.y_bottom, engine, False))
            pending = []

    groups: list[Group] = []

    for top, bottom, engine, other in entries:
        # A marker row is always a group of its own.
        if groups and engine is not None and groups[-1].members[-1][0] is not None and groups[-1].low - top <= GROUP_GAP:
            groups[-1].members.append((engine, other))
            groups[-1].low = bottom
        else:
            groups.append(Group(top, bottom, [(engine, other)]))

    return groups


def parse_page(
    lines: list[Line],
    page: int,
    known_parts: set[str] | None = None,
    carried: Vehicle | None = None,
    known_makes: set[str] | None = None,
) -> PageResult:
    """Fitment records on one application page.

    `carried` is the vehicle whose block continued from the previous page.
    `known_makes` are the words of the make names the catalogue uses in its
    page headers and numerical index; a name standing alone in the table is a
    new make only if it is made of them, which keeps notes such as "RHD" from
    being read as makes while still catching makes too short to head a page.
    """
    make = page_make(lines)
    body = sorted(
        (
            line
            for line in lines
            if CONTENT_Y[0] <= line.y <= CONTENT_Y[1] and line.x0 < TAB_MIN_X
        ),
        key=lambda line: (-line.y, line.x0),
    )
    result = PageResult(make=make)

    if not make:
        return result

    part_lines = [
        line
        for line in body
        if any(_in(bands["part"], line.x0) for bands in COLUMNS.values())
        and PART_RE.match(line.text)
    ]
    headers: list[tuple[Line, Vehicle]] = []

    for line in body:
        # A new make can start part-way down a page: its name stands alone
        # between two vehicle blocks, not beside any part.
        if (
            line.x0 > 200
            and MAKE_RE.match(line.text)
            and line.text not in COLUMN_TITLES
            and (
                known_makes is None
                or all(word in known_makes for word in line.text.split())
            )
            and not any(abs(part.y - line.y) <= NEAR for part in part_lines)
        ):
            make = line.text
            continue

        match = HEADER_RE.match(line.text) if line.x0 <= LEFT_MAX_X else None

        if match:
            headers.append(
                (
                    line,
                    Vehicle(
                        make=make,
                        model=match.group("model").strip(),
                        year_from=int(match.group("from").split(".")[1]),
                        year_to=int(match.group("to").split(".")[1]) if match.group("to") else None,
                        body=match.group("body") or None,
                        drive=match.group("drive"),
                        header=line.text,
                    ),
                )
            )

    # Blocks: text above the first header continues the previous page's vehicle.
    bounds: list[tuple[float, float, Vehicle | None]] = []
    top = CONTENT_Y[1] + 1

    if carried is not None and carried.make == result.make:
        first_y = headers[0][0].y if headers else CONTENT_Y[0] - 1
        bounds.append((top, first_y, carried))

    for index, (line, vehicle) in enumerate(headers):
        bottom = headers[index + 1][0].y if index + 1 < len(headers) else CONTENT_Y[0] - 1
        bounds.append((line.y, bottom, vehicle))

    for upper, lower, vehicle in bounds:
        if vehicle is None:
            continue

        block = [line for line in body if lower < line.y < upper]
        left = [line for line in block if line.x0 <= LEFT_MAX_X]
        dates = [line for line in block if _in(DATE_X, line.x0)]
        groups = _groups(left, dates)
        make = vehicle.make

        for position, bands in COLUMNS.items():
            parts = [
                line
                for line in block
                if _in(bands["part"], line.x0)
                and PART_RE.match(line.text)
                and not KIT_RE.match(line.text)
                and (known_parts is None or line.text in known_parts)
            ]

            for part in parts:
                note = clean_note(
                    " ".join(
                        line.text
                        for line in block
                        if _in(bands["note"], line.x0)
                        and abs(line.y - part.y) <= NEAR
                    )
                )
                kits = [
                    line.text
                    for line in block
                    if _in(bands["kit"], line.x0)
                    and abs(line.y - part.y) <= NEAR
                    and KIT_RE.match(line.text)
                ]
                members: list[tuple[Engine | None, bool]] = [(None, False)]

                if groups:
                    members = min(groups, key=lambda group: group.distance(part.y)).members

                for engine, other_versions in members:
                    restriction = " ".join(
                        piece
                        for piece in (OTHER_VERSIONS_NOTE if other_versions else None, note)
                        if piece
                    )
                    raw = " | ".join(
                        piece
                        for piece in (
                            f"{make} {vehicle.header}",
                            engine.name if engine else None,
                            position,
                            " ".join(kits) or None,
                            restriction or None,
                        )
                        if piece
                    )
                    result.fitments.append(
                        Fitment(
                            part_number=part.text,
                            page=page,
                            application=Application(
                                make=make,
                                model=vehicle.model,
                                body=vehicle.body,
                                year_from=(engine.year_from if engine and engine.year_from else vehicle.year_from),
                                year_to=(engine.year_to if engine and engine.year_to else vehicle.year_to),
                                engine=engine.name if engine else None,
                                power_kw=engine.power_kw if engine else None,
                                drivetrain=vehicle.drive,
                                position=position,
                                constraints={"raw": restriction} if restriction else None,
                                raw_text=raw[:2000],
                                record_ref=f"{FILE_NAME}, p. {page}",
                                record_url=PDF_URL,
                            ),
                        )
                    )

    if headers:
        result.last_vehicle = headers[-1][1]
    elif carried is not None and carried.make == result.make:
        result.last_vehicle = carried

    return result


APPLICATION_PAGES = (10, 497)
INDEX_PAGES = (498, 511)


def build(pdf_path, progress=None, lines_cache=None) -> dict[str, list[Fitment]]:
    """Reads the whole catalogue into fitment records per part number.

    Extracting positioned text takes several minutes on the store's server,
    so the extracted lines can be kept in `lines_cache` (a JSON file) and the
    parsing repeated without reading the PDF again.
    """
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
        wanted = list(range(APPLICATION_PAGES[0], INDEX_PAGES[1] + 1))
        pages = {}

        for number, lines in page_lines(pdf_path, wanted):
            pages[number] = lines

            if progress:
                progress(number, 0)

        if cache:
            cache.parent.mkdir(parents=True, exist_ok=True)
            cache.write_text(
                json.dumps({n: [dataclasses.astuple(line) for line in lines] for n, lines in pages.items()}, ensure_ascii=False),
                encoding="utf-8",
            )

    application_pages = range(APPLICATION_PAGES[0], APPLICATION_PAGES[1] + 1)
    known_parts: set[str] = set()

    for number in range(INDEX_PAGES[0], INDEX_PAGES[1] + 1):
        known_parts |= index_part_numbers(pages.get(number, []))

    known_makes: set[str] = set()

    for number in range(INDEX_PAGES[0], INDEX_PAGES[1] + 1):
        known_makes |= index_make_words(pages.get(number, []))

    for number in application_pages:
        known_makes |= set((page_make(pages.get(number, [])) or "").split())
    fitments: dict[str, list[Fitment]] = {}
    carried: Vehicle | None = None

    for number in application_pages:
        result = parse_page(
            pages.get(number, []), number, known_parts=known_parts, carried=carried, known_makes=known_makes
        )
        carried = result.last_vehicle

        for fitment in result.fitments:
            fitments.setdefault(fitment.part_number, []).append(fitment)

    return fitments
