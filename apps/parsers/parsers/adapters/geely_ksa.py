"""Geely Saudi Arabia's public, model-level genuine spare-parts list.

The page is a finite set of server-rendered tables; its JavaScript only
shows the selected model. It supplies own numbers, not cross references.
No engine, year range, side or equivalence is inferred from a model or name.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from bs4 import BeautifulSoup

from ..http import SourceError
from ..models import Application, Attribute, SourceMeta, SourceResult
from .base import Adapter, LookupRequest

CATALOG_URL = "https://geelyksa.com/spare-parts/"


def _compact(number: str) -> str:
    return re.sub(r"[^0-9A-Za-z]", "", number).upper()


@dataclass(frozen=True)
class PartRow:
    model: str
    model_id: str
    number: str
    description: str


def parse_rows(html: str) -> list[PartRow]:
    soup = BeautifulSoup(html, "html.parser")
    selector = soup.select_one("#geelyPartsDataOptions")
    containers = soup.select(".geelyPartsTables")
    if selector is None or not containers:
        raise SourceError("Geely KSA: the model selector or spare-parts tables are missing")
    options = {"partsTable" + str(o.get("value")): (o.get_text(" ", strip=True), str(o.get("data-postid")))
               for o in selector.select("option[value][data-postid]") if o.get("value") and o.get("data-postid")}
    rows = []
    for container in containers:
        matches = [options[c] for c in container.get("class") or [] if c in options]
        # The model is joined by the site's own class/value mapping, not by
        # the visual order of the dropdown or by interpreting its slug.
        if len(matches) != 1:
            continue
        model, model_id = matches[0]
        for table in container.select("table.partsTables"):
            headers = [cell.get_text(" ", strip=True) for cell in table.select("thead th")]
            if len(headers) < 3 or headers[1:3] != ["Part Number", "Description"]:
                raise SourceError("Geely KSA: the spare-parts table columns have changed")
        for row in container.select("table.partsTables tbody tr"):
            cells = row.find_all("td", recursive=False)
            if len(cells) < 3:
                continue
            number = cells[1].get_text(" ", strip=True)
            if number:
                rows.append(PartRow(model, model_id, number, cells[2].get_text(" ", strip=True)))
    return rows


class GeelyKsaAdapter(Adapter):
    version = "1.0.0"
    # The site asks AI crawlers for a 20-second delay. One cached page is
    # sufficient for a lookup; use the more conservative delay here too.
    min_interval = 20.0

    @property
    def source(self) -> SourceMeta:
        return SourceMeta(key="geely-ksa", name="Geely KSA (каталог виробника)",
                          kind="manufacturer_catalog", license_class="OPEN", lineage="Geely",
                          url=CATALOG_URL,
                          license_note="Regional public genuine-parts list; partial model-level fitment, no crosses or year/engine variants.")

    @property
    def brands(self) -> tuple[str, ...]:
        return ("Geely",)

    def lookup(self, request: LookupRequest) -> SourceResult:
        wanted = _compact(request.number)
        result = SourceResult()
        if not wanted or not self.supports(request):
            return result
        rows = [r for r in parse_rows(self.http.fetch(CATALOG_URL)) if _compact(r.number) == wanted]
        seen_applications, seen_names, seen_numbers = set(), set(), set()
        for row in rows:
            raw = f"{row.number} | {row.description}"
            if row.model_id not in seen_applications:
                seen_applications.add(row.model_id)
                result.applications.append(Application(make="Geely", model=row.model, raw_text=f"{row.model} | {raw}",
                                                       record_ref=f"model {row.model_id}; part {row.number}",
                                                       record_url=CATALOG_URL))
            if row.number not in seen_numbers:
                seen_numbers.add(row.number)
                result.attributes.append(Attribute(name="Part Number", value=row.number, raw_text=raw))
            if row.description and row.description not in seen_names:
                seen_names.add(row.description)
                result.attributes.append(Attribute(name="Description", value=row.description, raw_text=raw))
        for values, limit, label in ((result.applications, 5000, "Застосовність"),
                                    (result.attributes, 295, "Характеристики")):
            if len(values) > limit:
                total = len(values)
                del values[limit:]
                result.attributes.append(Attribute(name=f"{label} у каталозі", value=f"показано {limit} з {total}"))
        return result
