"""A supplier whose price list is a spreadsheet: XLSX or CSV.

Described by a small JSON file instead of code:

    {
      "name": "Постачальник А",
      "currency": "uah",
      "lead_days": 2,
      "file": "/home/vrn/prices/supplier-a.xlsx",
      "sheet": 0,
      "header_row": 1,
      "columns": {"brand": "Бренд", "number": "Артикул", "title": "Назва",
                  "price": "Ціна", "stock": "Залишок"}
    }

`file` is a path or an http(s) address. A column is named by its header text
or by its letter ("A", "B", ...). `brand` may be replaced by `"brand_value"`
when the whole list is one brand.
"""

from __future__ import annotations

import csv
import io
import json
import re
from pathlib import Path
from typing import Any, Iterator

import requests

from ..http import USER_AGENT, SourceError
from .base import OfferRow, SupplierAdapter, SupplierMeta

FIELDS = ("brand", "number", "title", "price", "stock", "lead_days")
REQUIRED = ("number", "price")


def _column_index(letter: str) -> int:
    index = 0

    for char in letter.upper():
        index = index * 26 + (ord(char) - ord("A") + 1)

    return index - 1


def _cell(value: Any) -> str:
    if value is None:
        return ""

    if isinstance(value, float) and value.is_integer():
        # 12345.0 in a spreadsheet is the number 12345.
        return str(int(value))

    return str(value).strip()


class PriceFileAdapter(SupplierAdapter):
    version = "1.0.0"

    def __init__(self, config: dict[str, Any]) -> None:
        self._config = config
        columns = config.get("columns") or {}
        missing = [
            field
            for field in REQUIRED
            if field not in columns
        ]

        if "brand" not in columns and not config.get("brand_value"):
            missing.append("brand")

        if not config.get("name") or not config.get("file") or missing:
            raise ValueError(
                "A price file needs name, file and columns for "
                + ", ".join(sorted({*missing, *([] if config.get("name") else ["name"])})  or ["?"])
            )

        self._columns: dict[str, str] = {key: str(value) for key, value in columns.items() if key in FIELDS}

    @classmethod
    def from_file(cls, path: Path) -> "PriceFileAdapter":
        return cls(json.loads(Path(path).read_text(encoding="utf-8")))

    @property
    def supplier(self) -> SupplierMeta:
        return SupplierMeta(
            name=self._config["name"],
            currency_code=str(self._config.get("currency", "uah")).lower(),
            lead_days=self._config.get("lead_days"),
        )

    def _read(self) -> bytes:
        location = str(self._config["file"])

        if re.match(r"^https?://", location):
            try:
                response = requests.get(location, headers={"User-Agent": USER_AGENT}, timeout=120)
            except requests.RequestException as error:
                raise SourceError(f"{type(error).__name__}: {error}") from error

            if response.status_code >= 400:
                raise SourceError(f"HTTP {response.status_code}")

            return response.content

        try:
            return Path(location).read_bytes()
        except OSError as error:
            raise SourceError(f"Price file cannot be read: {error}") from error

    def _table(self) -> Iterator[list[Any]]:
        data = self._read()
        location = str(self._config["file"]).lower().split("?")[0]

        if location.endswith((".xlsx", ".xlsm")):
            import openpyxl

            book = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
            sheet = self._config.get("sheet", 0)
            page = book[sheet] if isinstance(sheet, str) else book.worksheets[sheet]

            for row in page.iter_rows(values_only=True):
                yield list(row)

            return

        text = None

        for encoding in (self._config.get("encoding"), "utf-8-sig", "cp1251"):
            if not encoding:
                continue

            try:
                text = data.decode(encoding)
                break
            except UnicodeDecodeError:
                continue

        if text is None:
            raise SourceError("Price file is not UTF-8 or Windows-1251 text")

        first = text.split("\n", 1)[0]
        delimiter = self._config.get("delimiter") or max(";,\t|", key=first.count)

        yield from csv.reader(io.StringIO(text), delimiter=delimiter)

    def price_list(self) -> Iterator[OfferRow]:
        header_row = int(self._config.get("header_row", 1))
        positions: dict[str, int] = {}
        brand_value = self._config.get("brand_value")

        for number, row in enumerate(self._table(), 1):
            if number < header_row:
                continue

            if number == header_row:
                headers = [_cell(value).lower() for value in row]

                for field, column in self._columns.items():
                    if column.lower() in headers:
                        positions[field] = headers.index(column.lower())
                    elif re.fullmatch(r"[A-Za-z]{1,2}", column):
                        positions[field] = _column_index(column)
                    else:
                        raise SourceError(
                            f"Column \"{column}\" for {field} is not in the price file; "
                            f"its headers are: {', '.join(h for h in headers if h)}"
                        )

                continue

            def value(field: str) -> str:
                index = positions.get(field)

                return _cell(row[index]) if index is not None and index < len(row) else ""

            article = value("number")

            # Blank lines, group headings and totals have no article or price.
            if not article or not value("price"):
                continue

            lead = value("lead_days")
            yield OfferRow(
                brand=str(brand_value) if brand_value else value("brand"),
                number=article,
                price=value("price"),
                title=value("title") or None,
                stock=value("stock") or None,
                lead_days=int(lead) if lead.isdigit() else None,
            )

        if not positions:
            raise SourceError("Price file has no header row")
