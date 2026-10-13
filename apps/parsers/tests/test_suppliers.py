from __future__ import annotations

import io

import pytest

from parsers.http import SourceError
from parsers.suppliers.base import OfferRow, SupplierAdapter, SupplierMeta
from parsers.suppliers.price_file import PriceFileAdapter
from parsers.suppliers.sync import sync_supplier

CSV = """Прайс від 13.10.2026;;;;
Бренд;Артикул;Назва;Ціна;Залишок
Фільтри;;;;
MANN-FILTER;W 712/95;Масляний фільтр;330,50;>10
FILTRON;OP 520;Масляний фільтр;190;3
BOSCH;0 986 424 797;Колодки;1 450,00;в наявності
;;Разом;;
"""


def config(tmp_path, text=CSV, **extra):
    path = tmp_path / "price.csv"
    path.write_bytes(text.encode("cp1251"))

    return {
        "name": "Постачальник А",
        "file": str(path),
        "header_row": 2,
        "columns": {"brand": "Бренд", "number": "Артикул", "title": "Назва", "price": "Ціна", "stock": "Залишок"},
        **extra,
    }


def test_csv_in_windows_encoding_is_read_and_non_rows_are_left_out(tmp_path):
    rows = list(PriceFileAdapter(config(tmp_path)).price_list())

    assert [(r.brand, r.number, r.price, r.stock) for r in rows] == [
        ("MANN-FILTER", "W 712/95", "330,50", ">10"),
        ("FILTRON", "OP 520", "190", "3"),
        ("BOSCH", "0 986 424 797", "1 450,00", "в наявності"),
    ]
    assert rows[0].title == "Масляний фільтр"


def test_xlsx_is_read_with_columns_given_by_letter(tmp_path):
    import openpyxl

    book = openpyxl.Workbook()
    sheet = book.active
    sheet.append(["Артикул", "Опис", "Ціна, грн", "К-сть"])
    sheet.append(["W 712/95", "Масляний фільтр", 330.5, 12])
    sheet.append([27149, "Оливний фільтр", 220, 0])
    path = tmp_path / "price.xlsx"
    book.save(path)
    adapter = PriceFileAdapter(
        {
            "name": "Постачальник Б",
            "file": str(path),
            "brand_value": "febi",
            "columns": {"number": "A", "title": "B", "price": "Ціна, грн", "stock": "D"},
        }
    )

    assert [(r.brand, r.number, r.price, r.stock) for r in adapter.price_list()] == [
        ("febi", "W 712/95", "330.5", "12"),
        # A numeric article is a number in the sheet, not "27149.0".
        ("febi", "27149", "220", "0"),
    ]


def test_missing_column_is_named_instead_of_loading_nonsense(tmp_path):
    broken = config(tmp_path)
    broken["columns"]["price"] = "Вартість"

    with pytest.raises(SourceError, match="Вартість"):
        list(PriceFileAdapter(broken).price_list())


def test_description_without_required_columns_is_refused():
    with pytest.raises(ValueError):
        PriceFileAdapter({"name": "X", "file": "f.csv", "columns": {"number": "A"}})


class ListAdapter(SupplierAdapter):
    def __init__(self, rows):
        self._rows = rows

    @property
    def supplier(self) -> SupplierMeta:
        return SupplierMeta(name="Постачальник А", lead_days=2)

    def price_list(self):
        yield from self._rows


class FakeClient:
    def __init__(self, suppliers=None):
        self._suppliers = suppliers or []
        self.calls: list[tuple] = []

    def suppliers(self):
        return self._suppliers

    def create_supplier(self, payload):
        self.calls.append(("create", payload["name"]))

        return {"id": "sup_1", "name": payload["name"], "last_run": None}

    def open_run(self, supplier_id, file_name):
        self.calls.append(("open", supplier_id, file_name))

        return {"id": "run_1", "status": "open"}

    def post_rows(self, run_id, rows):
        self.calls.append(("rows", run_id, len(rows)))

        return {"rows": len(rows), "created": len(rows)}

    def finish_run(self, run_id):
        self.calls.append(("finish", run_id))

        return {"offers_delisted": 4, "errors": None}


def rows(count):
    return [OfferRow(brand="B", number=f"N{index}", price="10") for index in range(count)]


def test_price_list_is_loaded_in_parts_and_then_finished():
    client = FakeClient()
    totals = sync_supplier(client, ListAdapter(rows(2300)), "a.json")  # type: ignore[arg-type]

    assert client.calls == [
        ("create", "Постачальник А"),
        ("open", "sup_1", "a.json"),
        ("rows", "run_1", 1000),
        ("rows", "run_1", 1000),
        ("rows", "run_1", 300),
        ("finish", "run_1"),
    ]
    assert totals["rows"] == 2300 and totals["delisted"] == 4


def test_interrupted_load_is_continued_in_the_open_run():
    client = FakeClient([{"id": "sup_9", "name": "постачальник а", "last_run": {"id": "run_7", "status": "open"}}])
    sync_supplier(client, ListAdapter(rows(1)))  # type: ignore[arg-type]

    assert client.calls == [("rows", "run_7", 1), ("finish", "run_7")]


def test_empty_price_list_never_finishes_the_run():
    client = FakeClient()

    with pytest.raises(ValueError):
        sync_supplier(client, ListAdapter([]))  # type: ignore[arg-type]

    assert ("finish", "run_1") not in client.calls


def test_failure_while_reading_leaves_the_shelf_untouched():
    class Broken(ListAdapter):
        def price_list(self):
            yield from rows(3)
            raise SourceError("HTTP 503")

    client = FakeClient()

    with pytest.raises(SourceError):
        sync_supplier(client, Broken([]))  # type: ignore[arg-type]

    assert not any(call[0] == "finish" for call in client.calls)
