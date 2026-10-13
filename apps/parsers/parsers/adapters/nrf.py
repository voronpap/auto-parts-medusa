"""NRF public catalogue: cooling, climate, sensors and electrical parts.

The public Magento catalogue searches by NRF, OE and competitor numbers. A
product page gives the NRF code, OE numbers and specifications; the vehicle
table used by that page is a public JSON endpoint. OE numbers are not labelled
with a maker, so they are assigned to every make in the vehicle table and are
marked ambiguous when more than one make is present.
"""

from __future__ import annotations

import logging
import re
from typing import Any
from urllib.parse import quote, urljoin

from bs4 import BeautifulSoup

from ..models import Application, Attribute, NumberRef, Relationship, SourceMeta, SourceResult
from .base import MIN_FOREIGN_NUMBER, Adapter, LookupRequest, label_has_brand

log = logging.getLogger("parsers")

BASE_URL = "https://webshop.nrf.eu"
SEARCH_URL = f"{BASE_URL}/catalogsearch/advanced/result/"
MAX_APPLICATIONS = 5000
MAX_FOREIGN_PRODUCTS = 5
MAX_RELATIONSHIPS = 450

def _compact(number: str) -> str:
    """Comparison key only; output always keeps the catalogue spelling."""
    return re.sub(r"[^0-9A-Za-z]", "", number).upper()


def _absolute_url(href: str) -> str:
    url = urljoin(f"{BASE_URL}/", href)

    return url.replace(f"{BASE_URL}//", f"{BASE_URL}/", 1)


def _number(value: Any, kind: type[int] | type[float]) -> int | float | None:
    try:
        return kind(value) if value not in (None, "") else None
    except (TypeError, ValueError):
        return None


def _value(value: Any) -> str:
    if isinstance(value, dict):
        value = value.get("text")

    return str(value).strip() if value not in (None, "") else ""


def parse_search(html: str) -> list[tuple[str, str]]:
    """Return the NRF code and product URL from every actual result card."""
    soup = BeautifulSoup(html, "html.parser")
    products: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()

    for card in soup.select(".product-wrapper"):
        code_node = card.select_one(".product-data > .product-sku")
        link = card.select_one(".product-title a[href]")
        code = code_node.get_text(" ", strip=True) if code_node else ""
        href = link.get("href") if link else ""

        if not code or not href:
            continue

        item = (code, _absolute_url(str(href)))

        if item not in seen:
            seen.add(item)
            products.append(item)

    return products


def parse_product_page(
    html: str, record_url: str
) -> tuple[str | None, str | None, SourceResult, list[str]]:
    """Product code, product name, non-OE data and verbatim OE numbers."""
    soup = BeautifulSoup(html, "html.parser")
    code_node = soup.select_one('[itemprop="sku"]')
    title_node = soup.select_one("h1.page-title")
    code = code_node.get_text(" ", strip=True) if code_node else None
    title = title_node.get_text(" ", strip=True) if title_node else None
    result = SourceResult()
    oe_numbers: list[str] = []
    seen_oe: set[str] = set()
    seen_attributes: set[tuple[str, str]] = set()
    alternatives: list[str] = []

    for row in soup.select(".product-info-column .row"):
        label_node = row.select_one(".product-info-label")
        value_node = row.select_one(".product-info-value")

        if not label_node or not value_node:
            continue

        label = label_node.get_text(" ", strip=True)

        if label == "OE numbers":
            for node in value_node.select(".product-info-ref"):
                number = node.get_text(" ", strip=True)

                if number and number not in seen_oe:
                    seen_oe.add(number)
                    oe_numbers.append(number)

            continue

        value = value_node.get_text(" ", strip=True)

        if not label or not value:
            continue

        if label == "Alternative Product":
            # A displayed part number may contain spaces. Only actual item
            # nodes, never whitespace inside a number, separate alternatives.
            nodes = value_node.select(".product-info-ref, a")
            numbers = [node.get_text(" ", strip=True) for node in nodes] or [value]
            alternatives.extend(n for n in numbers if _compact(n) != _compact(code or ""))

        attribute = (label, value)

        if attribute not in seen_attributes:
            seen_attributes.add(attribute)
            result.attributes.append(
                Attribute(name=label[:200], value=value[:500], raw_text=f"{label}: {value}"[:2000])
            )

    if code:
        for alternative in dict.fromkeys(alternatives):
            result.relationships.append(
                Relationship(
                    to=NumberRef("NRF", "aftermarket", alternative),
                    relation_type="MANUFACTURER_INTERCHANGE",
                    raw_relation_text=f"Alternative Product: {alternative}",
                    record_ref=f"product {code}",
                    record_url=record_url,
                )
            )

    return code, title, result, oe_numbers


def parse_applications(
    data: dict[str, Any], code: str, record_url: str
) -> tuple[list[Application], list[str], int]:
    """Read the JSON rows used by the product page's vehicle table."""
    applications: list[Application] = []
    makes: list[str] = []

    for item in (data.get("items") or [])[:MAX_APPLICATIONS]:
        values = {
            str(attribute.get("attribute_code")): attribute.get("value")
            for attribute in item.get("custom_attributes") or []
            if attribute.get("attribute_code")
        }
        make = _value(values.get("v_brand_value"))

        if not make:
            continue

        if make not in makes:
            makes.append(make)

        model = _value(values.get("v_range")) or _value(values.get("v_model"))
        series = _value(values.get("v_series"))
        engine = _value(values.get("v_size"))
        displacement = _value(values.get("v_cc"))
        fuel = _value(values.get("v_fuel_value")) or _value(values.get("v_fuel"))
        engine_code = _value(values.get("v_motorcode"))
        power_hp = _value(values.get("v_hp"))
        generation = _value(values.get("v_generatie"))
        month_from = _value(values.get("v_month_from"))
        month_to = _value(values.get("v_month_to"))
        year_from_text = _value(values.get("v_year_from"))
        year_to_text = _value(values.get("v_year_to"))
        from_text = ".".join(filter(None, (month_from.zfill(2) if month_from else "", year_from_text)))
        to_text = ".".join(filter(None, (month_to.zfill(2) if month_to else "", year_to_text)))
        period = " - ".join(filter(None, (from_text, to_text)))
        raw_text = " | ".join(
            filter(
                None,
                (
                    make,
                    model,
                    series,
                    engine,
                    displacement,
                    fuel,
                    engine_code,
                    f"{power_hp} HP" if power_hp else "",
                    generation,
                    period,
                ),
            )
        )

        applications.append(
            Application(
                make=make,
                model=model or None,
                generation=generation or None,
                body=_value(values.get("v_body")) or None,
                year_from=_number(year_from_text, int),
                year_to=_number(year_to_text, int),
                engine=engine or None,
                engine_code=engine_code or None,
                power_kw=_number(values.get("v_kw"), float),
                fuel=fuel or None,
                drivetrain=_value(values.get("v_drive")) or None,
                raw_text=raw_text[:2000],
                record_ref=f"product {code}",
                record_url=record_url,
            )
        )

    total = int(data.get("total_count") or len(applications))

    return applications, makes, total


class NrfAdapter(Adapter):
    version = "1.1.0"
    min_interval = 5.0
    cross_search = True

    @property
    def source(self) -> SourceMeta:
        return SourceMeta(
            key="nrf",
            name="NRF (каталог виробника)",
            kind="manufacturer_catalog",
            license_class="OPEN",
            lineage="NRF",
            url=BASE_URL,
        )

    @property
    def brands(self) -> tuple[str, ...]:
        return ("NRF",)

    def _search(self, field: str, number: str) -> list[tuple[str, str]]:
        return parse_search(self.http.fetch(SEARCH_URL, params={field: number.strip()}))

    def _applications(self, code: str, record_url: str) -> tuple[list[Application], list[str], int]:
        data = self.http.fetch_json(
            f"{BASE_URL}/rest/V1/products/{quote(code, safe='')}/vehicles",
            params={"searchCriteria[pageSize]": MAX_APPLICATIONS},
        )

        return parse_applications(data, code, record_url)

    @staticmethod
    def _add_oe_relationships(
        result: SourceResult,
        code: str,
        record_url: str,
        oe_numbers: list[str],
        makes: list[str],
    ) -> None:
        listed = ", ".join(makes)

        for number in oe_numbers:
            for make in makes:
                if len(result.relationships) >= MAX_RELATIONSHIPS:
                    return

                ambiguous = len(makes) > 1
                result.relationships.append(
                    Relationship(
                        to=NumberRef(make, "oem", number),
                        relation_type="OEM_REFERENCE",
                        raw_relation_text=f"OE numbers: {number}",
                        ambiguous=ambiguous,
                        reason=(
                            f"The catalogue gives this OE number without a maker; "
                            f"the product fits {listed}."
                            if ambiguous
                            else None
                        ),
                        record_ref=f"product {code}",
                        record_url=record_url,
                    )
                )

    def lookup(self, request: LookupRequest) -> SourceResult:
        wanted = _compact(request.number)

        if not wanted:
            return SourceResult()

        match = next(
            ((code, url) for code, url in self._search("sku", request.number) if _compact(code) == wanted),
            None,
        )

        if match is None:
            return SourceResult()

        searched_code, record_url = match
        code, _, result, oe_numbers = parse_product_page(self.http.fetch(record_url), record_url)

        if not code or _compact(code) != _compact(searched_code) or _compact(code) != wanted:
            return SourceResult()

        applications, makes, total = self._applications(code, record_url)
        result.applications.extend(applications)

        if not makes and oe_numbers:
            # A product title is not an OE-maker label. Preserve the source's
            # unassigned references instead of inventing a maker from it.
            for number in oe_numbers:
                result.attributes.append(Attribute(name="OE numbers", value=number,
                                                   raw_text=f"OE numbers: {number}"))

        self._add_oe_relationships(result, code, record_url, oe_numbers, makes)

        if total > len(applications):
            log.warning("NRF %s: %d vehicles, %d kept", code, total, len(applications))
            result.attributes.append(
                Attribute(
                    name="Застосовність у каталозі",
                    value=f"показано {len(applications)} з {total} автомобілів",
                )
            )

        return result

    def lookup_foreign(self, request: LookupRequest) -> SourceResult:
        """NRF products whose page states the requested maker's OE number."""
        wanted = _compact(request.number)
        result = SourceResult()

        if len(wanted) < MIN_FOREIGN_NUMBER:
            return result

        for searched_code, record_url in self._search("p_oen", request.number)[:MAX_FOREIGN_PRODUCTS]:
            code, _, _, oe_numbers = parse_product_page(self.http.fetch(record_url), record_url)

            if not code or _compact(code) != _compact(searched_code):
                continue

            stated = next((number for number in oe_numbers if _compact(number) == wanted), None)

            if stated is None:
                continue

            _, makes, _ = self._applications(code, record_url)

            if not any(label_has_brand(make, request.brand) for make in makes):
                continue

            result.relationships.append(
                Relationship(
                    to=NumberRef("NRF", "aftermarket", code),
                    relation_type="OEM_REFERENCE",
                    direction="incoming",
                    raw_relation_text=f"OE numbers: {stated}",
                    ambiguous=len(makes) > 1,
                    reason=(
                        "The catalogue gives this OE number without a maker; "
                        f"the product fits {', '.join(makes)}."
                        if len(makes) > 1 else None
                    ),
                    record_ref=f"product {code}",
                    record_url=record_url,
                )
            )

        return result
