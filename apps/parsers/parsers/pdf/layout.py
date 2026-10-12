"""Text lines of a PDF page with their positions.

Catalogue tables put front and rear parts in different columns, so a part's
meaning depends on where it sits on the page. Positions come from pdfminer,
which resolves nested page transforms correctly.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterator


@dataclass(frozen=True)
class Line:
    y: float
    x0: float
    x1: float
    text: str


def page_lines(pdf_path: Path, page_numbers: list[int] | None = None) -> Iterator[tuple[int, list[Line]]]:
    """Yields (1-based page number, lines) for the requested pages."""
    from pdfminer.high_level import extract_pages
    from pdfminer.layout import LAParams, LTFigure, LTTextContainer, LTTextLine

    # all_texts: on some pages the table cells sit inside form objects, which
    # are skipped by layout analysis unless asked for.
    params = LAParams(char_margin=1.0, line_margin=0.3, word_margin=0.1, boxes_flow=None, all_texts=True)
    wanted = [number - 1 for number in page_numbers] if page_numbers else None

    def collect(container, lines: list[Line]) -> None:
        for element in container:
            if isinstance(element, LTFigure):
                collect(element, lines)
            elif isinstance(element, LTTextContainer):
                for line in element:
                    if isinstance(line, LTTextLine):
                        text = line.get_text().strip()

                        if text:
                            lines.append(Line(round(line.y1, 1), round(line.x0, 1), round(line.x1, 1), text))

    for index, page in enumerate(extract_pages(str(pdf_path), page_numbers=wanted, laparams=params)):
        lines: list[Line] = []
        collect(page, lines)
        number = (page_numbers[index] if page_numbers else index + 1)
        yield number, lines
