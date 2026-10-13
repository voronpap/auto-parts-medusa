"""MANN+HUMMEL group catalogues: MANN-FILTER and FILTRON.

Both brands run the same catalogue. A product page is rendered by the server
and carries the product's dimensions, technical data and every vehicle it is
used in. The page address is derived from the part number, and a number the
catalogue does not have is a plain 404.

Crosses are not on the page; they come from the catalogue's own API, asked
once per lookup: a product's OE numbers and comparison numbers (other
makers' equivalents), and, for a number of another maker, the products the
catalogue lists it for.
"""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.parse import parse_qs, quote, unquote_plus

from bs4 import BeautifulSoup

from ..http import SourceError
from ..models import Application, Attribute, NumberRef, Relationship, SourceMeta, SourceResult
from .base import MIN_FOREIGN_NUMBER, Adapter, LookupRequest, label_has_brand, normalize_brand

SPEC_HEADINGS = re.compile(r"Розміри|технічні характеристики|Dimensions|Technical", re.I)


COMPARISON_QUERY = (
    "query($sku:String!){products(filter:{sku:{eq:$sku}})"
    "{items{sku sales_designation oe_numbers{label value}comparison_numbers{label value}}}}"
)
CROSS_QUERY = (
    'query($search:String!){smart_search(search:$search pageSize:50 currentPage:1 applicationSegmentId:"")'
    "{cross_reference{items{product{sku url_key sales_designation}external_number ext_brand_name}}}}"
)
# The catalog accepts at most this many crosses in one result.
MAX_RELATIONSHIPS = 450

# Vehicle and engine makers as the catalogue labels them (normalized): a
# comparison number under one of these is an OE number.
VEHICLE_MAKERS = frozenset(
    """vw audi seat skoda cupra porsche bmw mini mercedesbenz daimler smart ford opel vauxhall
    generalmotors gm chevrolet daewoo renault dacia nissan infiniti peugeot citroen psa ds fiat
    alfaromeo lancia iveco toyota lexus honda acura hyundai kia mazda mitsubishi subaru suzuki
    daihatsu isuzu volvo saab jaguar landrover rover mg chrysler jeep dodge ssangyong lada vaz
    gaz uaz zaz tesla man scania daf chery geely byd greatwall haval changan jac faw lifan
    dongfeng""".split()
)
# The catalogue's label for a maker -> the name the catalog already uses.
BRAND_NAMES = {
    "febibilstein": "febi",
    "vwgroup": "VW",
    "volkswagen": "VW",
    "mercedes": "Mercedes-Benz",
    "kskolbenschmidt": "Kolbenschmidt",
}


def _label_brands(label: str) -> list[str]:
    """ "VW GROUP (AUDI/SEAT/SKODA/VW)" -> VW, AUDI, SEAT, SKODA."""
    names: list[str] = []

    for part in re.split(r"[()/,]", label):
        name = re.sub(r"\s+", " ", part).strip()
        name = BRAND_NAMES.get(normalize_brand(name), name)

        if name and normalize_brand(name) not in {normalize_brand(known) for known in names}:
            names.append(name)

    return names


def _is_vehicle_maker(label: str) -> bool:
    return any(normalize_brand(name) in VEHICLE_MAKERS for name in _label_brands(label))


def parse_comparison_numbers(data: dict[str, Any], record_url: str) -> list[Relationship]:
    """Other makers' numbers the catalogue gives as equivalents of one product."""
    items = ((data.get("data") or {}).get("products") or {}).get("items") or []
    found: list[Relationship] = []
    seen: set[tuple[str, str]] = set()

    product = items[0] if items else {}
    groups = [(group, True) for group in product.get("oe_numbers") or []] + [
        (group, False) for group in product.get("comparison_numbers") or []
    ]

    for group, listed_as_oe in groups:
        label = str(group.get("label") or "").strip()
        brands = _label_brands(label)

        if not brands:
            continue

        # The catalogue's OE list is OE whatever the maker; in the comparison
        # list a vehicle maker's number is an OE number as well.
        oem = listed_as_oe or _is_vehicle_maker(label)

        for value in group.get("value") or []:
            number = str(value).strip()
            key = (normalize_brand(brands[0]), _compact(number))

            if not number or key in seen:
                continue

            seen.add(key)
            found.append(
                Relationship(
                    to=NumberRef(brands[0], "oem" if oem else "aftermarket", number),
                    relation_type="OEM_REFERENCE" if oem else "AFTERMARKET_CROSS",
                    raw_relation_text=f"{'OE number' if listed_as_oe else 'comparison number'}: {label} {number}",
                    record_ref=f"product {product.get('sku')}",
                    record_url=record_url,
                )
            )

    # OE numbers first, in case the list has to be cut to what a result may carry.
    found.sort(key=lambda item: item.relation_type != "OEM_REFERENCE")

    return found[:MAX_RELATIONSHIPS]


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

    version = "1.2.0"
    min_interval = 5.0
    cross_search = True
    base_url: str
    store: str
    brand_name: str
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

    def _api(self, query: str, variables: dict[str, Any]) -> dict[str, Any]:
        host = "/".join(self.base_url.split("/")[:3])
        data = self.http.fetch_json(
            f"{host}/api/graphql/catalog-prod",
            params={"query": query, "variables": json.dumps(variables, ensure_ascii=False)},
            headers={"Store": self.store},
        )

        if not isinstance(data, dict) or data.get("errors"):
            raise SourceError("The catalogue API returned an error")

        return data

    def lookup_foreign(self, request: LookupRequest) -> SourceResult:
        """Products the catalogue lists as equivalents of another maker's number."""
        wanted = _compact(request.number)
        result = SourceResult()

        if len(wanted) < MIN_FOREIGN_NUMBER:
            return result

        data = self._api(CROSS_QUERY, {"search": request.number})
        items = (((data.get("data") or {}).get("smart_search") or {}).get("cross_reference") or {}).get("items") or []
        seen: set[str] = set()

        for item in items:
            label = str(item.get("ext_brand_name") or "")
            product = item.get("product") or {}
            number = str(product.get("sales_designation") or "").strip()

            # The search is fuzzy and spans makers: only this number under
            # this maker counts.
            if (
                not number
                or number in seen
                or _compact(str(item.get("external_number") or "")) != wanted
                or not label_has_brand(label, request.brand)
            ):
                continue

            seen.add(number)
            result.relationships.append(
                Relationship(
                    to=NumberRef(self.brand_name, "aftermarket", number),
                    relation_type="OEM_REFERENCE" if _is_vehicle_maker(label) else "AFTERMARKET_CROSS",
                    # The catalogue's product carries the reference to the asked number.
                    direction="incoming",
                    raw_relation_text=f"comparison number: {label} {item.get('external_number')}",
                    record_ref=f"product {product.get('sku')}",
                    record_url=f"{self.base_url}/catalog/search-results/product.html/{product.get('url_key')}.html",
                )
            )

        return result

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

        sku = (re.sub(r"\s+", "", request.number) + self.url_suffix).upper()
        result.relationships = parse_comparison_numbers(self._api(COMPARISON_QUERY, {"sku": sku}), url)

        return result


class MannFilterAdapter(_MannHummelAdapter):
    base_url = "https://www.mann-filter.com/ua-uk"
    url_suffix = "_mann-filter"
    source_key = "mann-filter"
    source_name = "MANN-FILTER (каталог виробника)"
    lineage = "mannfilter"
    brand_names = ("MANN-FILTER", "MANN", "Mann Filter")
    brand_name = "MANN-FILTER"
    store = "pcat_mf_ua_store_uk"


class FiltronAdapter(_MannHummelAdapter):
    base_url = "https://filtron.eu/en"
    url_suffix = "_filtron"
    source_key = "filtron"
    source_name = "FILTRON (каталог виробника)"
    lineage = "filtron"
    brand_names = ("FILTRON",)
    brand_name = "FILTRON"
    store = "pcat_ft_gb_store_en"
