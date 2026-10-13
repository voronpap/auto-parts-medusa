"""Spareto (spareto.com): a parts shop whose product pages publish reference
data for parts of every brand — OE numbers, cross-reference numbers,
specifications and the vehicles a part fits.

This is a shop, not a manufacturer: its reference data comes from a licensed
parts database, and the shop is not the origin of any of it. It is therefore
registered as a non-authoritative source with the database as its lineage,
so the catalog keeps what it says as candidates until an independent source
agrees, and several shops repeating the same database count once.

Only reference facts are read. Descriptions, photographs and prices are the
shop's own and are not taken.
"""

from __future__ import annotations

import html
import json
import re
import unicodedata
from urllib.parse import quote

from bs4 import BeautifulSoup

from ..models import Application, Attribute, NumberRef, Relationship, SourceMeta, SourceResult
from .base import MIN_FOREIGN_NUMBER, Adapter, LookupRequest, canonical_brand, label_has_brand

BASE_URL = "https://spareto.com"
# The catalog accepts at most this many crosses in one result.
MAX_RELATIONSHIPS = 450
# Products listed for an OE number that are passed on as its analogs.
MAX_FOREIGN_PRODUCTS = 80
# Rows of the properties table that describe the shop's terms, not the part.
SHOP_ROWS = {"warranty"}
YEARS_RE = re.compile(r"(\d{4})\s*-\s*(\d{4})?")
# Spellings of makers on this site -> the name the catalog already uses.
# Keys are comparison keys of canonical_brand.
BRAND_NAMES = {
    "febi": "febi",
    "mann": "MANN-FILTER",
    "hengstfilter": "HENGST",
    "alcofilter": "ALCO",
    "vw": "VW",
}


def _compact(number: str) -> str:
    """Comparison key only; numbers are always reported as the source writes them."""
    return re.sub(r"[^0-9A-Za-z]", "", number).upper()


def _brand(name: str) -> str:
    # Price lists and the catalog write makers without diacritics (LEMFORDER).
    name = "".join(c for c in unicodedata.normalize("NFKD", name) if not unicodedata.combining(c))
    name = re.sub(r"\s+", " ", name).strip()

    return BRAND_NAMES.get(canonical_brand(name), name)


def parse_cards(page: str) -> list[tuple[str, str, str]]:
    """(brand, number, product address) of every product card on a list page."""
    soup = BeautifulSoup(page, "html.parser")
    found: list[tuple[str, str, str]] = []

    for card in soup.select("[data-variant-card-gtm-item-value]"):
        try:
            item = json.loads(html.unescape(card["data-variant-card-gtm-item-value"]))
        except (ValueError, KeyError):
            continue

        link = card.select_one('a[href^="/products/"]')

        if item.get("item_brand") and item.get("item_id") and link:
            found.append((str(item["item_brand"]), str(item["item_id"]), f"{BASE_URL}{link['href']}"))

    return found


def _reference_rows(soup: BeautifulSoup, title: str) -> list[tuple[str, list[str]]]:
    """Rows "maker: numbers" under a heading of the Reference Numbers block."""
    heading = next((h for h in soup.find_all("h3") if h.get_text(" ", strip=True) == title), None)
    rows: list[tuple[str, list[str]]] = []
    node = heading.find_next_sibling() if heading else None

    while node is not None and node.name != "h3":
        cells = node.find_all("div", recursive=False) if node.name == "div" else []

        if len(cells) >= 2:
            maker = cells[0].get_text(" ", strip=True)
            numbers = [item.get_text(" ", strip=True) for item in cells[1].find_all(["a", "span"])]

            if maker and numbers:
                rows.append((maker, [number for number in numbers if number]))

        node = node.find_next_sibling()

    return rows


def parse_product_page(page: str, record_url: str) -> tuple[str | None, str | None, SourceResult]:
    """Brand and number of the product and the reference facts on its page."""
    soup = BeautifulSoup(page, "html.parser")
    brand_node = soup.select_one('[itemprop="brand"] meta[itemprop="name"]')
    brand = brand_node["content"].strip() if brand_node and brand_node.get("content") else None
    number_node = soup.select_one('h1 [itemprop="mpn"]')
    number = number_node.get_text(" ", strip=True) if number_node else None
    result = SourceResult()
    record_ref = f"product {brand} {number}"
    name = soup.select_one('h1 span[itemprop="name"]')

    if name and name.get_text(strip=True):
        result.attributes.append(Attribute(name="Назва (англ.)", value=name.get_text(" ", strip=True)))

    ean = soup.select_one('meta[itemprop="gtin13"]')

    if ean and ean.get("content"):
        result.attributes.append(Attribute(name="EAN", value=ean["content"].strip()))

    for row in soup.select("#product-properties tr"):
        cells = row.find_all("td")

        if len(cells) < 2:
            continue

        label = cells[0].get_text(" ", strip=True)
        value_node = cells[1].select_one('[itemprop="value"]')
        unit_node = cells[1].select_one('[itemprop="unitText"]')
        value = (value_node or cells[1]).get_text(" ", strip=True)

        if label and value and label.lower() not in SHOP_ROWS:
            result.attributes.append(
                Attribute(name=label, value=value, unit=unit_node.get_text(" ", strip=True) if unit_node else None)
            )

    oe_rows = _reference_rows(soup, "OE Numbers")
    vehicle_makers = {canonical_brand(_brand(maker)) for maker, _ in oe_rows}
    seen: set[tuple[str, str]] = set()

    def add(maker: str, value: str, oem: bool, wording: str) -> None:
        target = _brand(maker)
        key = (canonical_brand(target), _compact(value))

        if key in seen or (not oem and brand and key == (canonical_brand(_brand(brand)), _compact(number or ""))):
            return

        seen.add(key)
        result.relationships.append(
            Relationship(
                to=NumberRef(target, "oem" if oem else "aftermarket", value),
                relation_type="OEM_REFERENCE" if oem else "AFTERMARKET_CROSS",
                raw_relation_text=f"{wording}: {maker} {value}",
                record_ref=record_ref,
                record_url=record_url,
            )
        )

    for maker, values in oe_rows:
        for value in values:
            add(maker, value, True, "OE Numbers")

    for maker, values in _reference_rows(soup, "Cross-Reference Numbers"):
        # The cross list repeats the vehicle makers' numbers; those are OE.
        if canonical_brand(_brand(maker)) in vehicle_makers:
            continue

        for value in values:
            add(maker, value, False, "Cross-Reference Numbers")

    del result.relationships[MAX_RELATIONSHIPS:]

    vehicles = soup.select_one("#nav-vehicles")
    make: str | None = None

    for row in vehicles.select("div.row") if vehicles else []:
        cells = row.find_all("div", recursive=False)

        if len(cells) < 2:
            continue

        label = cells[0].get_text(" ", strip=True)
        detail = cells[1].get_text(" ", strip=True)

        if "cars" not in (row.get("class") or []):
            # A make heading: "AUDI — 154 vehicles".
            make = label or make
            continue

        if not make or not label:
            continue

        years = YEARS_RE.search(detail)
        result.applications.append(
            Application(
                make=make,
                model=label,
                year_from=int(years.group(1)) if years else None,
                year_to=int(years.group(2)) if years and years.group(2) else None,
                raw_text=f"{make} {label} {detail}".strip(),
                record_ref=record_ref,
                record_url=record_url,
            )
        )

    return brand, number, result


class SparetoAdapter(Adapter):
    version = "1.0.0"
    min_interval = 5.0
    cross_search = True

    @property
    def source(self) -> SourceMeta:
        return SourceMeta(
            key="spareto",
            name="Spareto (магазин, довідкові дані)",
            # A shop repeating a licensed database: never authoritative alone.
            kind="open_database",
            license_class="REFERENCE_ONLY",
            lineage="tecdoc",
            url=BASE_URL,
            license_note="Довідкові дані магазину походять з ліцензованої бази; беруться лише факти, по одному номеру за запитом.",
        )

    @property
    def brands(self) -> tuple[str, ...]:
        return ()

    def supports(self, request: LookupRequest) -> bool:
        """The shop lists parts of every aftermarket brand."""
        return request.number_type != "oem"

    def lookup(self, request: LookupRequest) -> SourceResult:
        wanted = _compact(request.number)

        if len(wanted) < 3:
            return SourceResult()

        cards = parse_cards(self.http.fetch(f"{BASE_URL}/products?keywords={quote(wanted)}"))
        # The search also returns the part's analogs: only this number under
        # this brand is the product that was asked for.
        match = next(
            (
                url
                for brand, number, url in cards
                if _compact(number) == wanted and label_has_brand(_brand(brand), request.brand)
            ),
            None,
        )

        if match is None:
            return SourceResult()

        brand, number, result = parse_product_page(self.http.fetch(match), match)

        if not brand or not number or _compact(number) != wanted or not label_has_brand(_brand(brand), request.brand):
            return SourceResult()

        return result

    def lookup_foreign(self, request: LookupRequest) -> SourceResult:
        """Products the shop lists for an OE number of the asked maker."""
        wanted = _compact(request.number)
        result = SourceResult()

        if request.number_type != "oem" or len(wanted) < MIN_FOREIGN_NUMBER:
            return result

        url = f"{BASE_URL}/oe/{quote(wanted.lower())}"
        page = self.http.fetch(url)
        heading = BeautifulSoup(page, "html.parser").h1
        title = heading.get_text(" ", strip=True) if heading else ""
        makers = title.rsplit(" by ", 1)[1] if " by " in title else ""

        # The page names the makers the number belongs to; another maker's
        # number that merely looks the same is not a match.
        if _compact(title.split(" ", 1)[0]) != wanted or not any(
            label_has_brand(maker, request.brand) for maker in makers.split(",")
        ):
            return result

        seen: set[tuple[str, str]] = set()

        for brand, number, product_url in parse_cards(page):
            key = (canonical_brand(_brand(brand)), _compact(number))

            if key in seen:
                continue

            seen.add(key)
            result.relationships.append(
                Relationship(
                    to=NumberRef(_brand(brand), "aftermarket", number),
                    relation_type="OEM_REFERENCE",
                    # The listed product carries the reference to the asked number.
                    direction="incoming",
                    raw_relation_text=title[:300],
                    record_ref=f"oe {wanted}",
                    record_url=product_url,
                )
            )

            if len(result.relationships) >= MAX_FOREIGN_PRODUCTS:
                break

        return result
