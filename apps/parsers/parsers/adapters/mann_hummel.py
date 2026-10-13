"""MANN+HUMMEL group catalogues: MANN-FILTER and FILTRON.

Both brands run the same catalogue. A product page is rendered by the server
and carries the product's dimensions, technical data and every vehicle it is
used in, so the page is read directly; the site's GraphQL API, which its
robots.txt closes to robots, is not used. The page address is derived from
the part number, and a number the catalogue does not have is a plain 404.

The pages list no OE numbers, so this source yields fitment and attributes.
"""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import parse_qs, quote, unquote_plus

from bs4 import BeautifulSoup

from ..http import SourceError
from ..models import Application, Attribute, SourceMeta, SourceResult
from .base import Adapter, LookupRequest

SPEC_HEADINGS = re.compile(r"Розміри|технічні характеристики|Dimensions|Technical", re.I)


def _compact(number: str) -> str:
    """Comparison key only; numbers are always reported as the source writes them."""
    return re.sub(r"[^0-9A-Za-z]", "", number).upper()


def _make_name(make: str) -> str:
    """ "VW (VOLKSWAGEN)" -> "VW": the bracket is the catalogue's own alias."""
    return re.sub(r"\s*\([^)]*\)\s*$", "", make).strip()


# The catalogue writes a year of 9999 for vehicles still in production and
# 1900 where the start of production is not known.
OPEN_ENDED_YEAR = 2100
UNKNOWN_START_YEAR = 1900


def _date(date: str | None) -> tuple[int, int] | None:
    match = re.match(r"(\d{4})-(\d\d)-\d\d", date or "")

    if not match or not UNKNOWN_START_YEAR < int(match.group(1)) < OPEN_ENDED_YEAR:
        return None

    return int(match.group(1)), int(match.group(2))


def _year(date: str | None) -> int | None:
    parsed = _date(date)

    return parsed[0] if parsed else None


def _month_year(date: str | None) -> str:
    parsed = _date(date)

    return f"{parsed[1]:02d}.{parsed[0]}" if parsed else ""


def _number(value: str | None) -> float | None:
    try:
        return float(value) if value else None
    except ValueError:
        return None


def parse_product_page(html: str, record_url: str) -> tuple[str | None, SourceResult]:
    """Title of the product page and what it states about the product."""
    soup = BeautifulSoup(html, "html.parser")
    heading = soup.find("h1")
    title = re.sub(r"\s+", " ", heading.get_text(" ", strip=True)) if heading else None
    result = SourceResult()

    if title:
        result.attributes.append(Attribute(name="Назва", value=title))

    seen_attributes: set[tuple[str, str]] = set()

    for section in soup.find_all(["h2", "h3"]):
        if not SPEC_HEADINGS.search(section.get_text(" ", strip=True)):
            continue

        table = section.find_next("table")

        for row in table.find_all("tr") if table else []:
            cells = [re.sub(r"\s+", " ", cell.get_text(" ", strip=True)) for cell in row.find_all(["th", "td"])]

            if len(cells) >= 2 and cells[0] and cells[1] and (cells[0], cells[1]) not in seen_attributes:
                seen_attributes.add((cells[0], cells[1]))
                result.attributes.append(Attribute(name=cells[0], value=cells[1]))

    seen_vehicles: set[str] = set()

    for link in soup.select("a[data-g-binding-application-link]"):
        params: dict[str, str] = {
            key: values[0]
            for key, values in parse_qs(
                unquote_plus(link.get("data-g-binding-params", "")).lstrip("?"), keep_blank_values=True
            ).items()
        }
        make = _make_name(params.get("vehicleMake", ""))
        vehicle_id = params.get("vehicleTypeId") or "|".join(
            params.get(key, "") for key in ("vehicleMake", "modelSeriesName", "vehicleName", "engineCode", "kw")
        )

        # The page repeats the table for narrow screens.
        if not make or vehicle_id in seen_vehicles:
            continue

        seen_vehicles.add(vehicle_id)
        row = link.find_parent("tr")
        cells = [re.sub(r"\s+", " ", cell.get_text(" ", strip=True)) for cell in row.find_all("td")] if row else []
        serial_range = params.get("serialNumberRange", "").strip()
        dates = " - ".join(
            filter(None, (_month_year(params.get("vehicleManufacturedFrom")), _month_year(params.get("vehicleManufacturedTo"))))
        )
        raw = " | ".join(
            piece
            for piece in (
                f"{make} {params.get('modelSeriesName', '')} {params.get('vehicleName', '')}".strip(),
                cells[1] if len(cells) > 1 else None,
                params.get("engineCode"),
                f"{params['ccm']} ccm" if params.get("ccm") else None,
                f"{params['kw']} kW" if params.get("kw") else None,
                dates,
                f"serial numbers {serial_range}" if serial_range else None,
            )
            if piece
        )
        result.applications.append(
            Application(
                make=make,
                model=params.get("modelSeriesName") or params.get("vehicleModel") or "",
                year_from=_year(params.get("vehicleManufacturedFrom")),
                year_to=_year(params.get("vehicleManufacturedTo")),
                engine=params.get("vehicleName") or None,
                engine_code=params.get("engineCode") or None,
                power_kw=_number(params.get("kw")),
                constraints={"raw": f"serial numbers {serial_range}"} if serial_range else None,
                raw_text=raw[:2000],
                record_ref=f"vehicle type {params['vehicleTypeId']}" if params.get("vehicleTypeId") else None,
                record_url=record_url,
            )
        )

    return title, result


class _MannHummelAdapter(Adapter):
    """Reads one brand's product pages. Subclasses name the brand and site."""

    version = "1.0.0"
    min_interval = 5.0
    base_url: str
    url_suffix: str
    source_key: str
    source_name: str
    lineage: str
    brand_names: tuple[str, ...]

    @property
    def source(self) -> SourceMeta:
        return SourceMeta(
            key=self.source_key,
            name=self.source_name,
            kind="manufacturer_catalog",
            license_class="OPEN",
            lineage=self.lineage,
            url=f"{self.base_url}/catalog.html",
        )

    @property
    def brands(self) -> tuple[str, ...]:
        return self.brand_names

    def product_url(self, number: str) -> str:
        # The catalogue keys a product by its number without spaces, in lower
        # case, keeping slashes: "W 712/95" -> "w712/95_mann-filter".
        key = re.sub(r"\s+", "", number).lower()

        return f"{self.base_url}/catalog/search-results/product.html/{quote(key, safe='/')}{self.url_suffix}.html"

    def lookup(self, request: LookupRequest) -> SourceResult:
        wanted = _compact(request.number)

        if not wanted:
            return SourceResult()

        url = self.product_url(request.number)

        try:
            html = self.http.fetch(url)
        except SourceError as error:
            if str(error) == "HTTP 404":
                return SourceResult()

            raise

        title, result = parse_product_page(html, url)

        # The address is built from the number, so make sure the page that
        # answered really is this product.
        if not title or wanted not in _compact(title):
            return SourceResult()

        return result


class MannFilterAdapter(_MannHummelAdapter):
    base_url = "https://www.mann-filter.com/ua-uk"
    url_suffix = "_mann-filter"
    source_key = "mann-filter"
    source_name = "MANN-FILTER (каталог виробника)"
    lineage = "mannfilter"
    brand_names = ("MANN-FILTER", "MANN", "Mann Filter")


class FiltronAdapter(_MannHummelAdapter):
    base_url = "https://filtron.eu/en"
    url_suffix = "_filtron"
    source_key = "filtron"
    source_name = "FILTRON (каталог виробника)"
    lineage = "filtron"
    brand_names = ("FILTRON",)
