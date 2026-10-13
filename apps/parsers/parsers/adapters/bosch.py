"""Bosch Automotive Aftermarket product search (Ukrainian catalogue).

Reads the JSON service behind the public product search on
boschaftermarket.com. It needs no session or key and returns the product's
specifications, the OE numbers it references and the vehicles it is used in.
"""

from __future__ import annotations

import logging
import re
from typing import Any
from urllib.parse import quote

from ..models import Application, Attribute, NumberRef, Relationship, SourceMeta, SourceResult
from .base import Adapter, LookupRequest

log = logging.getLogger("parsers")

API_URL = "https://ps.emea.dxtservice.com/ps/api/uk/ua"
PAGE_URL = "https://www.boschaftermarket.com/ua/uk/parts/product-search.html"
CATALOG_PARAMS = {
    "queryPIM": "true",
    "catalogId": "AA_WEBSITE_UA",
    "pimCountry": "ua",
    "pimLanguage": "uk_ua",
}
# The catalog accepts at most this many fitment rows in one result.
MAX_APPLICATIONS = 5000

# Specification rows that are not characteristics of the part.
ARTICLE_ROW = "Артикул"
ACCESSORY_ROW = "Рекомендовані приналежності"
ENGINE_SPLIT_RE = re.compile(r"^(?P<model>.+?)\s+(?P<engine>\d[.,]\d.*)$")


def _compact(number: str) -> str:
    """Comparison key only; numbers are always reported as the source writes them."""
    return re.sub(r"[^0-9A-Za-z]", "", number).upper()


def _make_name(make: str) -> str:
    """ "VW (VOLKSWAGEN)" -> "VW": the bracket is the catalogue's own alias."""
    return re.sub(r"\s*\([^)]*\)\s*$", "", make).strip()


def _year(period: dict[str, Any] | None, edge: str) -> int | None:
    year = ((period or {}).get(edge) or {}).get("year")

    return int(year) if year else None


def _month_year(period: dict[str, Any] | None, edge: str) -> str:
    part = (period or {}).get(edge) or {}

    if not part.get("year"):
        return ""

    return f"{int(part.get('month') or 0):02d}.{int(part['year'])}"


class BoschAdapter(Adapter):
    version = "1.0.0"
    min_interval = 3.0

    @property
    def source(self) -> SourceMeta:
        return SourceMeta(
            key="bosch",
            name="Bosch (каталог виробника)",
            kind="manufacturer_catalog",
            license_class="OPEN",
            lineage="bosch",
            url=PAGE_URL,
        )

    @property
    def brands(self) -> tuple[str, ...]:
        return ("Bosch",)

    def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        return self.http.fetch_json(f"{API_URL}{path}", params=params)

    def lookup(self, request: LookupRequest) -> SourceResult:
        wanted = _compact(request.number)

        if not wanted:
            return SourceResult()

        found = self._get(
            f"/search/{quote(wanted, safe='')}",
            {"pageNumber": 1, "pageSize": 10, **CATALOG_PARAMS},
        )

        # The search is fuzzy; only the product with exactly this number counts.
        if not any(
            _compact(str(product.get("productNumber", ""))) == wanted
            for product in found.get("products") or []
        ):
            return SourceResult()

        details = self._get(f"/search-details/{quote(wanted, safe='')}", CATALOG_PARAMS)
        record_ref = f"product {wanted}"
        record_url = f"{PAGE_URL}?query={quote(wanted)}"
        result = SourceResult()

        for row in details.get("oeNumbers") or []:
            columns = row.get("columnData") or []

            if len(columns) >= 2 and str(columns[0]).strip() and str(columns[1]).strip():
                result.relationships.append(
                    Relationship(
                        to=NumberRef(_make_name(str(columns[0])), "oem", str(columns[1])),
                        relation_type="OEM_REFERENCE",
                        raw_relation_text="cross reference (OE number)",
                        record_ref=record_ref,
                        record_url=record_url,
                    )
                )

        if details.get("name"):
            result.attributes.append(Attribute(name="Назва", value=str(details["name"])))

        for row in details.get("specificationTabData") or []:
            columns = [str(column).strip() for column in row.get("columnData") or []]

            if len(columns) < 2 or not columns[0] or not columns[1] or columns[0] == ARTICLE_ROW:
                continue

            if columns[0] == ACCESSORY_ROW:
                # The accessory is for this product, so the relation runs to it.
                result.relationships.append(
                    Relationship(
                        to=NumberRef("Bosch", "aftermarket", columns[1]),
                        relation_type="ACCESSORY_FOR",
                        direction="incoming",
                        raw_relation_text=columns[0],
                        record_ref=record_ref,
                        record_url=record_url,
                    )
                )
                continue

            result.attributes.append(Attribute(name=columns[0], value=columns[1]))

        makers = self._get(f"/usage-in-vehicles/{quote(wanted, safe='')}/makers").get("makers") or []
        total = 0

        for maker in makers:
            if not any(
                _compact(str(item.get("number", ""))) == wanted
                for item in maker.get("productNumbers") or []
            ):
                continue

            make = _make_name(str(maker.get("displayName") or ""))
            vehicles = self._get(
                f"/usage-in-vehicles/{quote(wanted, safe='')}/vehicles/{quote(str(maker['id']), safe='')}"
            ).get("vehicles") or []
            total += len(vehicles)

            for vehicle in vehicles:
                if len(result.applications) >= MAX_APPLICATIONS:
                    break

                result.applications.append(self._application(make, vehicle, record_ref, record_url))

        if total > len(result.applications):
            # Say so in the data rather than silently returning a partial list.
            log.warning("Bosch %s: %d vehicles, %d kept", wanted, total, len(result.applications))
            result.attributes.append(
                Attribute(
                    name="Застосовність у каталозі",
                    value=f"показано {len(result.applications)} з {total} автомобілів",
                )
            )

        return result

    @staticmethod
    def _application(make: str, vehicle: dict[str, Any], record_ref: str, record_url: str) -> Application:
        vehicle_type = str(vehicle.get("type") or "").strip()
        split = ENGINE_SPLIT_RE.match(vehicle_type)
        period = vehicle.get("productionPeriod")
        power = (vehicle.get("powerRange") or {}).get("fromKw")
        dates = " - ".join(filter(None, (_month_year(period, "from"), _month_year(period, "to"))))
        raw = " | ".join(
            str(piece)
            for piece in (
                f"{make} {vehicle_type}",
                vehicle.get("modelRange"),
                vehicle.get("motorType"),
                f"{power:g} kW" if power else None,
                dates,
                vehicle.get("bodyType"),
            )
            if piece
        )

        return Application(
            make=make,
            model=split.group("model") if split else vehicle_type,
            generation=vehicle.get("modelRange") or None,
            body=vehicle.get("bodyType") or None,
            year_from=_year(period, "from"),
            year_to=_year(period, "to"),
            engine=split.group("engine") if split else None,
            engine_code=vehicle.get("motorType") or None,
            power_kw=float(power) if power else None,
            raw_text=raw[:2000],
            record_ref=record_ref,
            record_url=record_url,
        )
