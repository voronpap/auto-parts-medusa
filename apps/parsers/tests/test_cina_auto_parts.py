import hashlib
import json
import sys
from contextlib import nullcontext
from pathlib import Path
from types import SimpleNamespace

import pytest

from parsers.adapters import ADAPTERS
from parsers.http import SourceError
from parsers.pdf import cina_auto_parts as cina


FIXTURE = json.loads((Path(__file__).parent / "fixtures/cina_tables.json").read_text(encoding="utf-8"))


def raw_index():
    return {"format": "cina-auto-parts-raw-v1", "number_role": "unresolved_product_number",
            "rows": [row for excerpt in FIXTURE["excerpts"]
                     for row in cina.parse_table(excerpt["table"], excerpt["page"])]}


def test_literal_cells_have_no_manufacturer_number_type_or_claims():
    rows = raw_index()["rows"]
    assert len(rows) == 8
    assert all(set(row) == {"car_brand_label", "product_number", "product_name", "page", "raw_text"} for row in rows)
    assert rows[0] == {"car_brand_label": "BYD", "product_number": "1205010",
                       "product_name": "Адсорбер flyer", "page": 1, "raw_text": "BYD | 1205010 | Адсорбер flyer"}


def test_group_ids_are_not_product_numbers():
    assert cina.find_rows(raw_index(), "00003726") == []
    assert cina.find_rows(raw_index(), "00004728") == []


def test_find_compares_compact_codes_but_preserves_suffix_and_spelling():
    found = cina.find_rows(raw_index(), "a11 3502031", "chery")
    assert [r["product_number"] for r in found] == ["A11-3502031"]
    assert cina.find_rows(raw_index(), "A11-3502031BB")[0]["product_number"] == "A11-3502031BB"


def test_same_number_under_another_label_is_not_returned():
    assert cina.find_rows(raw_index(), "1205010", "GEELY") == []
    assert cina.find_rows(raw_index(), "1205010", "BYD")[0]["car_brand_label"] == "BYD"


def test_categories_remain_raw_labels_not_makes_or_oe():
    row = cina.find_rows(raw_index(), "OF36")[0]
    assert row["car_brand_label"] == 'ФИЛЬТРА "ADK"'
    assert "QQ6,Кимо" in row["product_name"]
    assert "applications" not in row and "brand" not in row


def test_slashes_parentheses_spaces_and_leading_zero_are_literal():
    row = cina.find_rows(raw_index(), "E0493000021(13)")[0]
    assert row["product_number"] == "E0493000021(13)"
    assert cina.find_rows(raw_index(), "DS-MS/GW Hover")[0]["product_number"] == "DS-MS/GW Hover"
    rows = cina.parse_table([["label", "001 20-A", "name  2"]], 1)
    assert rows[0]["product_number"] == "001 20-A" and rows[0]["product_name"] == "name  2"


def test_duplicates_and_source_order_are_not_deduplicated():
    table = [["BYD", "1205010", "Адсорбер flyer"]] * 2
    assert len(cina.parse_table(table, 1)) == 2


@pytest.mark.parametrize("table", [None, [], [["x", "code"]], [["", "code", "name"]],
                                  [["x", "code", ""]], [["BYD", "", "missing code"]],
                                  [["BYD", "a" * 101, "name"]]])
def test_malformed_tables_fail_closed(table):
    with pytest.raises(SourceError):
        cina.parse_table(table, 1)


@pytest.mark.parametrize("page", [0, -1, True, "1"])
def test_invalid_page_fails_closed(page):
    with pytest.raises(SourceError):
        cina.parse_table([["BYD", "1205010", "name"]], page)


@pytest.mark.parametrize("field,value", [("format", "kyb"), ("number_role", "oe")])
def test_typed_or_foreign_indexes_are_refused(field, value):
    index = raw_index()
    index[field] = value
    with pytest.raises(SourceError):
        cina.find_rows(index, "1205010")


def test_empty_search_is_not_a_full_catalogue_query():
    assert cina.find_rows(raw_index(), "---") == []


def fake_pdf(monkeypatch, tables=None, text=cina.PUBLISHER):
    if tables is None:
        tables = [excerpt["table"] for excerpt in FIXTURE["excerpts"]]
    pages = [SimpleNamespace(extract_table=lambda t=t: t, extract_text=lambda: text) for t in tables]
    pdf = SimpleNamespace(pages=pages, metadata={"CreationDate": "D:20161217093428+08'00'"})
    monkeypatch.setitem(sys.modules, "pdfplumber", SimpleNamespace(open=lambda _: nullcontext(pdf)))


def test_build_reads_every_page_and_preserves_group_rows_and_fingerprint(tmp_path, monkeypatch):
    path = tmp_path / "catalog.pdf"
    path.write_bytes(b"%PDF-test")
    fake_pdf(monkeypatch)
    progress = []
    index = cina.build_index(path, lambda n, total: progress.append((n, total)))
    assert index["sha256"] == hashlib.sha256(path.read_bytes()).hexdigest()
    assert index["pages"] == 4 and progress == [(1, 4), (2, 4), (3, 4), (4, 4)]
    assert len(index["rows"]) == 8 and len(index["grouping_rows"]) == 4
    assert index["grouping_rows"][0]["car_brand_label"] == "00003726"
    assert index["grouping_rows"][0]["product_number"] == ""
    assert index["number_role"] == "unresolved_product_number"
    assert index["catalog_version"] == "D:20161217093428+08'00'"
    assert "not publication edition" in index["catalog_version_basis"]
    assert index["column_headers"] == cina.HEADERS and index["source_url"] == FIXTURE["source_url"]


@pytest.mark.parametrize("tables,text", [([], cina.PUBLISHER), ([cina.HEADERS], "Other supplier"),
    ([[["Brand", "Number", "Name"]]], cina.PUBLISHER),
    ([FIXTURE["excerpts"][0]["table"], [["00004728", "", "GEELY"]]], cina.PUBLISHER)])
def test_changed_identity_or_empty_pages_refuse_partial_index(tmp_path, monkeypatch, tables, text):
    path = tmp_path / "catalog.pdf"
    path.write_bytes(b"%PDF-test")
    fake_pdf(monkeypatch, tables, text)
    with pytest.raises(SourceError):
        cina.build_index(path)


def test_raw_source_is_not_registered_for_lookups_or_import():
    assert not any("cina" in adapter.__name__.lower() for adapter in ADAPTERS)
