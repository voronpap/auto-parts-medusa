"""One-time, literal table index of Cina Auto Parts' public 2016 catalogue.

Car brands is a vehicle/category label, not an asserted manufacturer of the
Product Number. Keep those fields unresolved: no OE, interchange, year or
model is inferred from the code's spelling or free-text product name.
"""
from __future__ import annotations

import hashlib
import re
from pathlib import Path

from ..http import SourceError

PARSER_VERSION = "1.0.0"
PDF_URL = "https://www.cinaautoparts.com/wp-content/uploads/2016/12/geely-chery-lifan-great-wall-byd-parts-catalog-Cinaautoparts.pdf"
HEADERS = ["Car brands", "Product Number", "Product Name"]
PUBLISHER = "TAIZHOU CINA AUTO PARTS CO.,LTD."


def parse_table(table, page):
    if not isinstance(page, int) or isinstance(page, bool) or page < 1:
        raise SourceError("Cina catalogue page number is invalid")
    if not isinstance(table, list) or not table:
        raise SourceError("Cina catalogue table is missing")
    rows = []
    for cells in table:
        if not isinstance(cells, (list, tuple)) or len(cells) != 3:
            raise SourceError("Cina catalogue table columns changed")
        label, number, name = [str(value or "").strip() for value in cells]
        if [label, number, name] == HEADERS:
            continue
        if not number:
            # Source grouping rows have an internal numeric ID in column 1
            # and a bold category/make in column 3, not a product number.
            if re.fullmatch(r"[0-9]+", label) and name:
                continue
            raise SourceError("Cina row without product number is not a grouping row")
        if not label or not name:
            raise SourceError("Cina numbered row has no label or description")
        if len(number) > 100:
            raise SourceError("Cina product number is unexpectedly long")
        rows.append({"car_brand_label": label, "product_number": number, "product_name": name,
                     "page": page, "raw_text": " | ".join((label, number, name))})
    return rows


def build_index(pdf_path, progress=None):
    import pdfplumber

    pdf_path = Path(pdf_path)
    rows = []
    grouping_rows = []
    with pdfplumber.open(pdf_path) as pdf:
        count = len(pdf.pages)
        creation_date = (pdf.metadata or {}).get("CreationDate")
        if not count:
            raise SourceError("Cina catalogue has no pages")
        for number, page in enumerate(pdf.pages, 1):
            if PUBLISHER not in (page.extract_text() or ""):
                raise SourceError(f"Cina publisher identity is missing on page {number}")
            table = page.extract_table()
            if number == 1 and (not table or table[0] != HEADERS):
                raise SourceError("Cina catalogue column headings changed")
            parsed = parse_table(table, number)
            if not parsed:
                raise SourceError(f"Cina product rows are missing on page {number}")
            rows.extend(parsed)
            for label, code, name in table:
                if not str(code or "").strip():
                    cells = [str(value or "").strip() for value in (label, code, name)]
                    grouping_rows.append(dict(zip(("car_brand_label", "product_number", "product_name"), cells),
                                              page=number, raw_text=" | ".join(cells)))
            if progress:
                progress(number, count)
    return {"format": "cina-auto-parts-raw-v1", "parser_version": PARSER_VERSION,
            "catalog_version": creation_date or "not stated",
            "catalog_version_basis": "PDF CreationDate metadata, not publication edition",
            "column_headers": HEADERS, "source_url": PDF_URL,
            "sha256": hashlib.sha256(pdf_path.read_bytes()).hexdigest(), "pages": count,
            "number_role": "unresolved_product_number", "rows": rows, "grouping_rows": grouping_rows}


def find_rows(index, number, car_brand_label=None):
    if index.get("format") != "cina-auto-parts-raw-v1" or index.get("number_role") != "unresolved_product_number":
        raise SourceError("Cina raw index format is invalid")
    wanted = re.sub(r"[^A-Za-z0-9]", "", number or "").upper()
    if not wanted:
        return []
    return [row for row in index["rows"]
            if re.sub(r"[^A-Za-z0-9]", "", row["product_number"]).upper() == wanted
            and (car_brand_label is None or row["car_brand_label"].casefold() == car_brand_label.casefold())]
