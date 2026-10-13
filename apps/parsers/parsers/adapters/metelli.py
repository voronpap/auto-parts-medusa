"""Public Metelli Group search and labelled references (six own brands).

Search URLs use Metelli's internal code even for Cifam/Trusting/Fri.tech.
The visible code and the source's brand must therefore both be checked.
Sharing a search result or a fitment never establishes an interchange.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import parse_qs, urljoin, urlsplit

from bs4 import BeautifulSoup

from ..http import SourceError
from ..models import Application, Attribute, NumberRef, Relationship, SourceMeta, SourceResult
from .base import MIN_FOREIGN_NUMBER, Adapter, LookupRequest, label_has_brand, normalize_brand

BASE_URL = "https://www.metelligroup.it"
CATALOG_URL = f"{BASE_URL}/en"
SEARCH_URL = f"{BASE_URL}/en/Home/PartList"
BRANDS = {"metelli": "Metelli", "cifam": "Cifam", "trusting": "Trusting",
          "fritech": "Fri.tech.", "graf": "Graf", "kwp": "KWP"}
MAX_FOREIGN_PRODUCTS = 6


def _compact(value: str) -> str:
    return re.sub(r"[^0-9A-Za-z]", "", value).upper()


def _variable(soup: BeautifulSoup, key: str) -> str | None:
    # Literal server-supplied strings only, never evaluate page JavaScript.
    for script in soup.select("script:not([src])"):
        match = re.search(r"\bvar\s+" + re.escape(key) + r"\s*=\s*['\"]([^'\"]*)['\"]\s*;", script.get_text())
        if match:
            return match.group(1)
    return None


def _safe_url(path: str) -> str | None:
    url = urljoin(BASE_URL, path)
    parts = urlsplit(url)
    actions = {"productdetail", "getvehiclesbymake", "vehiclemodels", "vehicleversions", "productfamily", "partlist"}
    return url if (parts.netloc == urlsplit(BASE_URL).netloc and parts.scheme == "https"
                   and parts.path.lower().startswith("/en/home/")
                   and parts.path.rsplit("/", 1)[-1].lower() in actions and not parts.fragment) else None


@dataclass(frozen=True)
class SearchHit:
    brand: str
    number: str
    url: str
    label: str


def parse_search(html: str) -> list[SearchHit]:
    soup = BeautifulSoup(html, "html.parser")
    found, seen = [], set()
    for table in soup.select("table"):
        heading = table.select_one("h5")
        maker = heading.get_text(" ", strip=True) if heading else ""
        for link in table.select('tbody td p > a[href*="ProductDetail"]'):
            href = str(link.get("href") or "")
            key = (parse_qs(urlsplit(href).query).get("brand") or [""])[0]
            brand = BRANDS.get(key)
            if not brand or not label_has_brand(maker, brand):
                continue
            text = link.get_text(" ", strip=True)
            number = text.partition(" ")[0]
            url = _safe_url(href)
            if number and url and (brand, number, url) not in seen:
                found.append(SearchHit(brand, number, url, text))
                seen.add((brand, number, url))
    return found


@dataclass
class Product:
    brand: str | None
    number: str | None
    result: SourceResult
    make_names: dict[str, str]
    vehicle_url: str | None
    internal_code: str | None
    brand_key: str | None
    explicit_refs: set[tuple[str, str, str]]


def hit_matches_product(hit: SearchHit, product: Product) -> bool:
    # Search labels include a description, but the code must end at a
    # whitespace boundary. A shorter detail code cannot validate a prefix.
    return bool(product.number and product.brand and label_has_brand(product.brand, hit.brand)
                and (hit.label.casefold() == product.number.casefold()
                     or hit.label.casefold().startswith(product.number.casefold() + " ")))


def parse_product(html: str, record_url: str) -> Product:
    soup = BeautifulSoup(html, "html.parser")
    title = soup.select_one(".advtitle")
    number, _, name = title.get_text(" ", strip=True).partition(" - ") if title else ("", "", "")
    if not title or not number or not name:
        raise SourceError("Metelli product identity is missing")
    key = _variable(soup, "brand")
    brand = BRANDS.get(key or "")
    result = SourceResult()
    makes = {str(o.get("value")): o.get_text(" ", strip=True) for o in soup.select("#vehicle option[value]")
             if str(o.get("value")) not in ("0", "-1", "") and o.get_text(strip=True)}
    if name:
        result.attributes.append(Attribute(name="Назва", value=name))
    for node in soup.select("#informations p"):
        raw = node.get_text(" ", strip=True)
        label, sep, value = raw.partition(":")
        if sep and label.strip() and value.strip():
            result.attributes.append(Attribute(name=label.strip(), value=value.strip(), raw_text=raw))
    seen, explicit_refs = set(), set()
    for row in soup.select("#adnumber tbody tr"):
        cells = row.find_all("td", recursive=False)
        if len(cells) < 4:
            continue
        target, competitor, make = [c.get_text(" ", strip=True) for c in cells[1:4]]
        if not target or not competitor:
            continue
        oe = competitor.upper() == "OE"
        labels = [make] if oe and make else list(makes.values()) if oe else [competitor]
        raw = "AD. NUMBER: " + " | ".join((target, competitor, make))
        if oe and not labels:
            result.attributes.append(Attribute(name="OE number without maker", value=target, raw_text=raw))
        for label in labels:
            relation = "OEM_REFERENCE" if oe else "TRADE_NUMBER" if normalize_brand(competitor) in ("wva", "fmsi") else "COMPETITOR_REFERENCE"
            identity = (label, target, relation)
            if not oe or make:
                explicit_refs.add(identity)
            if identity in seen:
                continue
            seen.add(identity)
            ambiguous = oe and not make and len(labels) > 1
            result.relationships.append(Relationship(
                to=NumberRef(label, "oem" if oe else "trade" if relation == "TRADE_NUMBER" else "aftermarket", target),
                relation_type=relation, raw_relation_text=raw, ambiguous=ambiguous,
                reason=f"OE number has no maker; source lists vehicles of {', '.join(labels)}." if ambiguous else None,
                record_ref=f"product {number}", record_url=record_url,
            ))
    vehicle_path = _variable(soup, "getVehiclesUrl")
    return Product(brand, number or None, result, makes, _safe_url(vehicle_path) if vehicle_path else None,
                   _variable(soup, "code"), key, explicit_refs)


def _year(text: str) -> int | None:
    match = re.fullmatch(r"(?:\d{2}/)?(\d{4})", text.strip())
    return int(match.group(1)) if match else None


def parse_vehicles(html: str, product: Product, record_url: str) -> list[Application]:
    soup = BeautifulSoup(html, "html.parser")
    found = []
    for row in soup.select("tr"):
        cells = row.find_all("td", recursive=False)
        link = row.select_one('a[href*="ProductFamily"]')
        if not link or len(cells) != 8:
            continue
        context = parse_qs(urlsplit(str(link.get("href") or "")).query)
        make = product.make_names.get((context.get("make") or [""])[0])
        if not make or (context.get("brand") or [""])[0] != product.brand_key:
            continue
        values = [c.get_text(" ", strip=True) for c in cells]
        vehicle = values[1]
        model = vehicle[len(make):].strip() if vehicle.casefold().startswith(make.casefold() + " ") else vehicle
        conditions = []
        next_row = row.find_next_sibling("tr")
        while next_row:
            extra = next_row.find_all("td", recursive=False)
            if len(extra) != 1 or not extra[0].get("colspan"):
                break
            text = extra[0].get_text(" ", strip=True)
            if text:
                conditions.append(text)
            next_row = next_row.find_next_sibling("tr")
        power = values[5].replace(",", ".")
        constraints = {"conditions": conditions} if conditions else {}
        if values[6]:
            constraints["displacement_cc"] = values[6]
        raw = " | ".join((*values[1:], *conditions))
        found.append(Application(
            make=make, model=model or None, engine_code=values[2] if values[2] not in ("", "-") else None,
            year_from=_year(values[3]), year_to=_year(values[4]),
            power_kw=float(power) if re.fullmatch(r"\d+(?:\.\d+)?", power) else None,
            fuel=values[7] or None, constraints=constraints or None, raw_text=raw[:2000],
            record_ref=f"product {product.number}; vehicle {(context.get('version') or [''])[0]}", record_url=record_url,
        ))
    return found


class MetelliAdapter(Adapter):
    version = "1.0.0"
    min_interval = 5.0
    cross_search = True

    @property
    def source(self) -> SourceMeta:
        return SourceMeta(key="metelli", name="Metelli Group: Metelli / Cifam / Trusting / Fri.tech. / Graf / KWP (каталог виробника)",
                          kind="manufacturer_catalog", license_class="OPEN", lineage="Metelli", url=CATALOG_URL)

    @property
    def brands(self) -> tuple[str, ...]:
        return tuple(BRANDS.values())

    def _search(self, number: str) -> list[SearchHit]:
        return parse_search(self.http.fetch(SEARCH_URL, method="POST", form_body={"searchtext": number}))

    def _product(self, hit: SearchHit) -> Product | None:
        product = parse_product(self.http.fetch(hit.url), hit.url)
        return product if hit_matches_product(hit, product) else None

    def lookup(self, request: LookupRequest) -> SourceResult:
        wanted = _compact(request.number)
        if not wanted or not self.supports(request):
            return SourceResult()
        candidates = [h for h in self._search(request.number.strip())
                      if label_has_brand(h.brand, request.brand) and _compact(h.label).startswith(wanted)]
        product, hit = None, None
        for candidate in candidates[:MAX_FOREIGN_PRODUCTS]:
            page = self._product(candidate)
            if page and _compact(page.number) == wanted:
                product, hit = page, candidate
                break
        if product is None:
            return SourceResult()
        if product.vehicle_url and product.internal_code and product.brand_key:
            html = self.http.fetch(product.vehicle_url, params={"brand": product.brand_key,
                                   "code": product.internal_code, "language": "en", "make": "-1"})
            product.result.applications = parse_vehicles(html, product, hit.url)
        for values, limit, label in ((product.result.relationships, 450, "Кроси"),
                                    (product.result.applications, 5000, "Застосовність"),
                                    (product.result.attributes, 295, "Характеристики")):
            if len(values) > limit:
                total = len(values)
                del values[limit:]
                product.result.attributes.append(Attribute(name=f"{label} у каталозі", value=f"показано {limit} з {total}"))
        return product.result

    def lookup_foreign(self, request: LookupRequest) -> SourceResult:
        wanted = _compact(request.number)
        result = SourceResult()
        if len(wanted) < MIN_FOREIGN_NUMBER:
            return result
        for hit in self._search(request.number.strip())[:MAX_FOREIGN_PRODUCTS]:
            product = self._product(hit)
            if not product:
                continue
            for relationship in product.result.relationships:
                if (relationship.to and not relationship.ambiguous
                        and (relationship.to.brand, relationship.to.number, relationship.relation_type) in product.explicit_refs
                        and label_has_brand(relationship.to.brand, request.brand)
                        and _compact(relationship.to.number) == wanted):
                    result.relationships.append(Relationship(
                        to=NumberRef(product.brand, "aftermarket", product.number), relation_type=relationship.relation_type,
                        direction="incoming", raw_relation_text=relationship.raw_relation_text,
                        record_ref=relationship.record_ref, record_url=hit.url,
                    ))
                    break
        return result
