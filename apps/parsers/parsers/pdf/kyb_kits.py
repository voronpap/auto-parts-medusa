"""KYB shock absorber catalogue: OE numbers and replaced part numbers.

Two sections at the back of the PDF state crosses rather than fitment:

* the numerical listing of suspension mounting kits, where every kit is
  pictured with the vehicle makes and the OE numbers it replaces;
* the tables of alternative and discontinued KYB numbers.

A kit listed for several makes does not say which make each OE number
belongs to, so such a number is recorded once per make and marked ambiguous
for review instead of being assigned by guesswork.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from .kyb import CATALOG_VERSION  # noqa: F401  (same document, same version)
from .layout import Line

PARSER_VERSION = "1.0.0"

PAGES = (540, 591)
KIT_TITLE = "SUSPENSION MOUNTING KIT"
LISTING_TITLE = "NUMERICAL LISTING"
ALTERNATIVE_TITLE = "Alternative PN"
DISCONTINUED_TITLE = "Discontinued PN"

LABEL_SIZE = 8.0
KIT_TEXT_SIZE = 6.0
ALTERNATIVE_SIZE = 8.5
DISCONTINUED_SIZE = 9.0
SECTION_TITLE_SIZE = 17.0

# A trailing "n" is the catalogue's mark for a new part, not part of the number.
KIT_LABEL_RE = re.compile(r"^(SM\d{4})n?$")
OE_NUMBER_RE = re.compile(r"^[0-9A-Z][0-9A-Z .\-/]{3,24}$")
KYB_NUMBER_RE = re.compile(r"^(?:\d{6,7}|SM\d{4}|[A-Z]{2}-?\d{3,4})$")
CONTINUATION = "c…"

# The catalogue's spelling of a make -> the name the catalog already uses.
MAKE_NAMES = {
    "Volkwagen": "VW",
    "Volkswagen": "VW",
    "Mercedes Benz": "Mercedes-Benz",
    "Citroën": "Citroen",
}


def _sized(line: Line, size: float) -> bool:
    return abs(line.size - size) < 0.3


def is_kit_page(lines: list[Line]) -> bool:
    titles = {line.text for line in lines if line.size >= 11.5}

    return KIT_TITLE in titles and LISTING_TITLE in titles


def is_alternative_page(lines: list[Line]) -> bool:
    return any(_sized(line, SECTION_TITLE_SIZE) and line.text == ALTERNATIVE_TITLE for line in lines)


def _makes(text: str) -> list[str]:
    """ "Chevrolet (GM), Chevrolet - Daewoo" -> Chevrolet, Daewoo."""
    names: list[str] = []

    for part in re.split(r",| - ", text):
        name = re.sub(r"\s+", " ", re.sub(r"\([^)]*\)", "", part)).strip()
        name = MAKE_NAMES.get(name, name)

        if name and name not in names:
            names.append(name)

    return names


def parse_kit_page(lines: list[Line], page: int) -> dict[str, list[dict[str, Any]]]:
    """OE references per mounting kit pictured on the page."""
    labels = [line for line in lines if _sized(line, LABEL_SIZE) and KIT_LABEL_RE.match(line.text)]
    cells: dict[tuple[float, float], list[Line]] = {}
    owners: dict[tuple[float, float], str] = {}

    for line in lines:
        if not _sized(line, KIT_TEXT_SIZE) or line.text == "|":
            continue

        above = [label for label in labels if label.y > line.y]

        if not above:
            continue

        row_y = min(label.y for label in above)
        # A long list runs into a second column of the same cell, so the
        # owner is the nearest label to the left, not the nearest overall.
        left = [label for label in above if abs(label.y - row_y) < 3 and label.x0 <= line.x0 + 2]

        if not left:
            continue

        label = max(left, key=lambda item: item.x0)
        key = (label.y, label.x0)
        owners[key] = KIT_LABEL_RE.match(label.text).group(1)  # type: ignore[union-attr]
        cells.setdefault(key, []).append(line)

    found: dict[str, list[dict[str, Any]]] = {}

    for key, texts in cells.items():
        kit = owners[key]
        makes: list[str] = []
        make_text = ""
        numbered = False
        seen: set[tuple[str, str]] = {
            (item["to"]["brand"], item["to"]["number"]) for item in found.get(kit, [])
        }

        for line in sorted(texts, key=lambda item: (round(item.x0 / 20), -item.y)):
            text = line.text.strip()

            if text.startswith(CONTINUATION) or text in ("c...", "c.."):
                continue

            if re.search(r"[a-zà-ÿ]", text):
                # Makes wrap over lines; a new list starts once numbers followed.
                if not make_text or numbered:
                    make_text = text
                elif make_text.endswith("-") and not make_text.endswith(" -"):
                    make_text = make_text[:-1] + text
                else:
                    make_text = f"{make_text} {text}"

                numbered = False
                makes = _makes(make_text)
                continue

            if not makes or not OE_NUMBER_RE.match(text):
                continue

            numbered = True
            listed = ", ".join(makes)

            for make in makes:
                if (make, text) in seen:
                    continue

                seen.add((make, text))
                record: dict[str, Any] = {
                    "to": {"brand": make, "number_type": "oem", "number": text},
                    "relation_type": "OEM_REFERENCE",
                    "raw_relation_text": f"{KIT_TITLE} {kit}: {listed} {text}",
                    "record_ref": f"page {page}",
                }

                if len(makes) > 1:
                    record["ambiguous"] = True
                    record["reason"] = (
                        f"The catalogue lists this number for {listed} without saying which make it belongs to."
                    )

                found.setdefault(kit, []).append(record)

    return found


def parse_alternative_page(lines: list[Line], page: int) -> dict[str, list[dict[str, Any]]]:
    """Replaced and discontinued KYB numbers stated on the page."""
    found: dict[str, list[dict[str, Any]]] = {}
    pairs = sorted((line for line in lines if _sized(line, ALTERNATIVE_SIZE)), key=lambda item: item.x0)
    # The table is printed as number / alternative column pairs.
    columns: list[float] = []

    for line in pairs:
        if not columns or line.x0 - columns[-1] > 20:
            columns.append(line.x0)

    def column_of(line: Line) -> int:
        return min(range(len(columns)), key=lambda index: abs(columns[index] - line.x0))

    for line in pairs:
        index = column_of(line)

        if index % 2 or index + 1 >= len(columns) or not KYB_NUMBER_RE.match(line.text):
            continue

        partner = [
            other
            for other in pairs
            if column_of(other) == index + 1 and abs(other.y - line.y) < 4.5
        ]

        if not partner:
            continue

        closest = min(partner, key=lambda other: abs(other.y - line.y))

        for number in (part.strip() for part in closest.text.split("/")):
            if KYB_NUMBER_RE.match(number) and number != line.text:
                found.setdefault(line.text, []).append(
                    {
                        "to": {"brand": "KYB", "number_type": "aftermarket", "number": number},
                        "relation_type": "SUPERSEDED_BY",
                        "raw_relation_text": f"{ALTERNATIVE_TITLE}: {line.text} -> {closest.text}",
                        "record_ref": f"page {page}",
                    }
                )

    for line in lines:
        if _sized(line, DISCONTINUED_SIZE) and KYB_NUMBER_RE.match(line.text) and line.text not in found:
            found[line.text] = [
                {
                    "to": None,
                    "relation_type": "DISCONTINUED_NO_REPLACEMENT",
                    "raw_relation_text": DISCONTINUED_TITLE,
                    "record_ref": f"page {page}",
                }
            ]

    return found


def parse_pages(pages: dict[int, list[Line]]) -> dict[str, list[dict[str, Any]]]:
    relationships: dict[str, list[dict[str, Any]]] = {}
    replaced: dict[str, list[dict[str, Any]]] = {}

    for page in sorted(pages):
        lines = pages[page]

        if is_kit_page(lines):
            for kit, records in parse_kit_page(lines, page).items():
                known = {(r["to"]["brand"], r["to"]["number"]) for r in relationships.get(kit, [])}
                relationships.setdefault(kit, []).extend(
                    r for r in records if (r["to"]["brand"], r["to"]["number"]) not in known
                )
        elif is_alternative_page(lines):
            for number, records in parse_alternative_page(lines, page).items():
                replaced.setdefault(number, []).extend(records)

    for number, records in replaced.items():
        # A number with a stated alternative is not "discontinued without replacement".
        if any(record["to"] for record in records):
            records = [record for record in records if record["to"]]

        relationships.setdefault(number, []).extend(records)

    return relationships


def build_index(pdf_path, progress=None, lines_cache=None) -> dict[str, Any]:
    """Reads the cross sections of the PDF; page text is cached beside the index."""
    import json

    from .layout import page_lines

    cache = Path(lines_cache) if lines_cache else None
    pages: dict[int, list[Line]] = {}

    if cache and cache.exists():
        pages = {
            int(number): [Line(*item) for item in items]
            for number, items in json.loads(cache.read_text(encoding="utf-8")).items()
        }
    else:
        for number, lines in page_lines(Path(pdf_path), list(range(PAGES[0], PAGES[1] + 1))):
            pages[number] = lines

            if progress:
                progress(number, lines)

        if cache:
            cache.parent.mkdir(parents=True, exist_ok=True)
            cache.write_text(
                json.dumps(
                    {
                        number: [[l.y, l.x0, l.x1, l.text, l.font, l.size] for l in lines]
                        for number, lines in pages.items()
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )

    return {
        "parser_version": PARSER_VERSION,
        "catalog_version": CATALOG_VERSION,
        "parts": {},
        "relationships": dict(sorted(parse_pages(pages).items())),
    }
