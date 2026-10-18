"""NiBK/JNBK public brake catalogue, including Chinese makes.

The part-number form and detail pages are server-rendered HTML. Every cross
has its own maker label. Adjacent parts in the vehicle table are fitment
information only and never become crosses of the requested part.
"""
from __future__ import annotations

import re
from urllib.parse import unquote, urljoin, urlsplit

from bs4 import BeautifulSoup

from ..models import Application, Attribute, Image, NumberRef, Relationship, SourceMeta, SourceResult
from .base import MIN_FOREIGN_NUMBER, Adapter, LookupRequest, label_has_brand, normalize_brand
from .mann_hummel import VEHICLE_MAKERS

BASE_URL = "https://www.nibk.jp"
CATALOG_URL = f"{BASE_URL}/catalogue/cars"
MAX_PRODUCTS = 5
MAX_RELATIONSHIPS = 450
MAX_APPLICATIONS = 5000
TRADE_LABELS = {"fmsi", "wva"}
DATE = re.compile(r"^(?:(\d{2})\.(\d{2}|\d{4}))?\s*~\s*(?:(\d{2})\.(\d{2}|\d{4}))?$")


def compact(number: str) -> str:
    return re.sub(r"[^A-Za-z0-9]", "", number).upper()


def product_links(html: str) -> list[tuple[str, str]]:
    """Only catalogue detail URLs, with their own code taken from the path."""
    soup = BeautifulSoup(html, "html.parser")
    found: dict[str, str] = {}
    for link in soup.select('a[href*="/catalogue/cars/brake/"]'):
        url = urljoin(CATALOG_URL, str(link.get("href") or ""))
        parsed = urlsplit(url)
        if parsed.hostname != "www.nibk.jp":
            continue
        match = re.fullmatch(r"/catalogue/cars/brake/\d+/([^/]+)/?", parsed.path)
        if match:
            code = unquote(match.group(1))
            found.setdefault(code, url)
    return list(found.items())


def _year(value: str | None) -> int | None:
    if not value:
        return None
    year = int(value)
    return year if len(value) == 4 else year + (1900 if year >= 50 else 2000)


def product_image_url(soup: BeautifulSoup, code: str) -> str | None:
    for image in soup.select("a[href] img[alt]"):
        anchor = image.find_parent("a")
        if anchor is None or compact(image.get("alt", "")) != compact(code):
            continue
        if compact(anchor.get("title", "")) != compact(code):
            continue
        url = urljoin(BASE_URL, str(anchor.get("href") or ""))
        parsed = urlsplit(url)
        if (
            parsed.scheme == "https"
            and parsed.hostname == "www.nibk.jp"
            and not parsed.query
            and not parsed.fragment
            and re.fullmatch(r"/images/watermark_images/[0-9a-f]{32}_watermark\.jpg", parsed.path)
        ):
            return url
    return None


def _label_makers(label: str) -> list[str]:
    # A parenthesis is the source's corporate alias, not a second vehicle
    # maker (e.g. MG (SAIC)). Slash-separated makes are explicitly joint.
    return [part.strip() for part in re.sub(r"\([^)]*\)", "", label).split("/") if part.strip()]


def parse_product_page(html: str, record_url: str) -> tuple[str | None, SourceResult]:
    soup = BeautifulSoup(html, "html.parser")
    heading = soup.select_one("#divWrapper h2.search-title")
    if heading is None:
        heading = soup.select_one("h2.search-title")
    text = heading.get_text(" ", strip=True) if heading else ""
    name, separator, code = text.partition("»")
    code = code.strip()
    result = SourceResult()
    if not separator or not code:
        return None, result

    ref = f"product {code}"
    image_url = product_image_url(soup, code)
    if image_url:
        result.images.append(Image(url=image_url, kind="photo", record_url=record_url))
    # The source's own car-maker selector extends the shared list, including
    # new Chinese makes such as ZEEKR and VOYAH without guessing by number.
    car_makers = set(VEHICLE_MAKERS)
    for option in soup.select("#selBrand option"):
        car_makers.update(normalize_brand(m) for m in _label_makers(option.get_text(" ", strip=True)))

    result.attributes.append(Attribute(name="Product", value=name.strip(), raw_text=text))
    for row in soup.select(".detail__specification .str"):
        label_node, value_node = row.select_one(".param-title"), row.select_one(".param-field")
        label = label_node.get_text(" ", strip=True) if label_node else ""
        value = value_node.get_text(" ", strip=True) if value_node else ""
        if label and value:
            result.attributes.append(Attribute(name=label, value=value, raw_text=f"{label}: {value}"))

    seen: set[tuple[str, str]] = set()
    for row in soup.select(".detail__plate .str"):
        owner_node, number_node = row.select_one(".owner"), row.select_one(".field")
        owner = owner_node.get_text(" ", strip=True) if owner_node else ""
        number = number_node.get_text(" ", strip=True) if number_node else ""
        if not owner or not number:
            continue
        makers = _label_makers(owner)
        for maker in makers:
            key = (normalize_brand(maker), number)
            if key in seen or len(result.relationships) >= MAX_RELATIONSHIPS:
                continue
            seen.add(key)
            trade = normalize_brand(maker) in TRADE_LABELS
            oem = normalize_brand(maker) in car_makers
            result.relationships.append(Relationship(
                to=NumberRef(maker, "trade" if trade else "oem" if oem else "aftermarket", number),
                relation_type="TRADE_NUMBER" if trade else "OEM_REFERENCE" if oem else "COMPETITOR_REFERENCE",
                raw_relation_text=f"Cross Reference: {owner} {number}",
                record_ref=ref, record_url=record_url,
            ))

    for body in soup.select(".model-body"):
        title = body.find_previous_sibling("div", class_="model-title")
        title_text = title.get_text(" ", strip=True) if title else ""
        make, separator, model = title_text.partition("»")
        if not separator or not make.strip():
            continue
        for row in body.select("tr"):
            cells = row.select("td")
            if len(cells) < 4:
                continue
            # The source table lists all brakes for a vehicle. Keep only
            # rows/positions containing this exact part, never its neighbours.
            positions = [
                cell.get("data-title") or ""
                for cell in cells[4:]
                if any(compact(link.get_text(" ", strip=True)) == compact(code)
                       for link in cell.select("a.parts"))
            ]
            if not positions:
                continue
            values = [cell.get_text(" ", strip=True) for cell in cells[:4]]
            date = DATE.fullmatch(values[0])
            for position in dict.fromkeys(positions):
                if len(result.applications) >= MAX_APPLICATIONS:
                    break
                result.applications.append(Application(
                    make=make.strip(), model=model.strip() or None,
                    year_from=_year(date.group(2)) if date else None,
                    year_to=_year(date.group(4)) if date else None,
                    engine=f"{values[1]} cc" if values[1] else None,
                    engine_code=values[2] or None, body=values[3] or None,
                    position=position or None,
                    raw_text=" | ".join([title_text, *values, position]),
                    record_ref=ref, record_url=record_url,
                ))
    return code, result


class NibkAdapter(Adapter):
    version = "1.0.0"
    min_interval = 5.0
    cross_search = True

    @property
    def source(self) -> SourceMeta:
        return SourceMeta(
            key="nibk", name="NiBK / JNBK (каталог виробника)",
            kind="manufacturer_catalog", license_class="OPEN", lineage="NiBK",
            url=CATALOG_URL,
            license_note="The catalogue states that its data is advisory and for reference.",
        )

    @property
    def brands(self) -> tuple[str, ...]:
        return ("NiBK", "JNBK")

    def _search(self, number: str) -> str:
        return self.http.fetch(
            CATALOG_URL, method="POST",
            form_body={"txtPartNo": number.strip(), "txtClass": "1", "btnProductSearch": "Search"},
        )

    @staticmethod
    def _url(html: str, code: str) -> str:
        return next((url for found, url in product_links(html) if compact(found) == compact(code)),
                    CATALOG_URL)

    def lookup(self, request: LookupRequest) -> SourceResult:
        wanted = compact(request.number)
        if not wanted:
            return SourceResult()
        html = self._search(request.number)
        code, _ = parse_product_page(html, CATALOG_URL)
        if code:
            return parse_product_page(html, self._url(html, code))[1] if compact(code) == wanted else SourceResult()
        match = next(((code, url) for code, url in product_links(html) if compact(code) == wanted), None)
        if match:
            found, result = parse_product_page(self.http.fetch(match[1]), match[1])
            if found and compact(found) == wanted:
                return result
        return SourceResult()

    def lookup_foreign(self, request: LookupRequest) -> SourceResult:
        wanted = compact(request.number)
        result = SourceResult()
        if len(wanted) < MIN_FOREIGN_NUMBER:
            return result
        html = self._search(request.number)
        code, _ = parse_product_page(html, CATALOG_URL)
        pages = [(code, self._url(html, code), html)] if code else [
            (candidate, url, None) for candidate, url in product_links(html)[:MAX_PRODUCTS]
        ]
        for candidate, url, page in pages:
            found, data = parse_product_page(page if page is not None else self.http.fetch(url), url)
            if not found or compact(found) != compact(candidate):
                continue
            stated = next((r for r in data.relationships
                           if r.to and compact(r.to.number) == wanted
                           and label_has_brand(r.to.brand, request.brand)), None)
            if stated:
                result.relationships.append(Relationship(
                    to=NumberRef("NiBK", "aftermarket", found),
                    relation_type=stated.relation_type, direction="incoming",
                    raw_relation_text=stated.raw_relation_text,
                    record_ref=f"product {found}", record_url=url,
                ))
        return result
