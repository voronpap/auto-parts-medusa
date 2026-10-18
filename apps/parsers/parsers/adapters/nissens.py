"""Nissens public catalogue: OE references, vehicle rows and specifications.

The public page uses HTML partial views, not a JSON product API. Number
searches also show neighbouring products for each car. Only exact numbered
buttons count as own products; foreign references are confirmed in the
product's OE list under the make stated by its detail header.
"""
from __future__ import annotations

import csv
import re
from dataclasses import dataclass
from urllib.parse import urlencode

from bs4 import BeautifulSoup

from ..http import SourceError
from ..models import Application, Attribute, Image, NumberRef, Relationship, SourceMeta, SourceResult
from .base import MIN_FOREIGN_NUMBER, Adapter, LookupRequest, label_has_brand

BASE_URL = "https://catalogue.nissens.com"
CATALOG_URL = f"{BASE_URL}/Product"
SEARCH_URL = f"{CATALOG_URL}/Search?ReloadingLastSearch=False"
DETAIL_URL = f"{CATALOG_URL}/ProductDetails"
DETAIL_FIELDS = (
    "productID", "carProductID", "carID", "manufacturerID", "vehicleID", "modelID",
    "transmissionID", "airconditionID", "fuelID", "engineCode", "isCore",
)
MAX_PAGES = 50
PAGE_SIZE = 100
MAX_APPLICATIONS = 5000
MAX_FOREIGN_PRODUCTS = 5
MAX_RELATIONSHIPS = 450
MAX_PRODUCT_IMAGES = 4
DATE = re.compile(r"(?:(\d{1,2})/(\d{4}))?\s*->\s*(?:(\d{1,2})/(\d{4}))?")
PRODUCT_IMAGE = re.compile(
    r"https://customerportal\.nissens\.com/ImageBank360Degree/([0-9A-Za-z]+)/NIS-\1-(\d+)\.jpg"
)


def compact(number: str) -> str:
    return re.sub(r"[^A-Za-z0-9]", "", number).upper()


def search_defaults(html: str) -> dict[str, str]:
    soup = BeautifulSoup(html, "html.parser")
    form = soup.select_one("#formDoSearch")
    if not form:
        raise SourceError("Nissens public search form is missing")
    # SearchID identifies a prior anonymous search. It is not needed for a
    # new search; omitting it gives stable cache keys without session state.
    defaults: dict[str, str] = {}
    for node in form.select("input[name]"):
        name, kind = str(node["name"]), str(node.get("type", ""))
        if name == "SearchID" or kind in ("submit", "button"):
            continue
        if kind == "checkbox" and not node.has_attr("checked"):
            continue
        defaults[name] = str(node.get("value", "on" if kind == "checkbox" else ""))
    return defaults


@dataclass
class SearchHit:
    number: str
    detail_params: dict[str, str]
    application: Application

    @property
    def record_url(self) -> str:
        return f"{DETAIL_URL}?{urlencode(self.detail_params)}"


def parse_search(html: str) -> tuple[list[SearchHit], list[int]]:
    soup = BeautifulSoup(html, "html.parser")
    hits: list[SearchHit] = []
    for row in soup.select("#checkboxContainer tr"):
        cells = row.find_all("td", recursive=False)
        if len(cells) < 10:
            continue
        values = [cell.get_text(" ", strip=True) for cell in cells[:10]]
        make, vehicle, engine, fuel, ac, transmission, engine_code, kw, _, dates = values
        if not make:
            continue
        for button in row.select(".resultLink[onclick]"):
            number = button.get_text(" ", strip=True)
            match = re.search(r"showProductDetails\(this,([\s\S]*?)\)\s*;", str(button["onclick"]))
            if not match or not number:
                continue
            # Parse literal arguments only. Never execute source JavaScript.
            args = next(csv.reader([re.sub(r"[\r\n]+", " ", match.group(1))],
                                   quotechar="'", escapechar="\\", skipinitialspace=True))
            args = [value.strip() for value in args]
            if len(args) < len(DETAIL_FIELDS) or compact(args[0]) != compact(number):
                continue
            params = dict(zip(DETAIL_FIELDS, args[:len(DETAIL_FIELDS)]))
            # The button's context must agree with the actual vehicle row.
            if params["manufacturerID"] != make:
                continue
            date = DATE.fullmatch(dates)
            try:
                power = float(kw) if kw and kw != "-" else None
            except ValueError:
                power = None
            application = Application(
                make=make, model=vehicle or None, engine=engine or None,
                fuel=fuel or None, transmission=transmission or None,
                engine_code=engine_code if engine_code not in ("", "-") else None,
                power_kw=power,
                year_from=int(date.group(2)) if date and date.group(2) else None,
                year_to=int(date.group(4)) if date and date.group(4) else None,
                constraints={"air_conditioning": ac} if ac not in ("", "-", "+/-") else None,
                raw_text=" | ".join(values),
                record_ref=f"product {number}; car product {params['carProductID']}",
                record_url=f"{DETAIL_URL}?{urlencode(params)}",
            )
            hits.append(SearchHit(number, params, application))
    pages = sorted({int(str(link["pageno"])) for link in soup.select("a[pageno]")
                    if str(link["pageno"]).isdigit()})
    return hits, pages


def parse_details(html: str, record_url: str) -> tuple[str | None, str | None, SourceResult]:
    soup = BeautifulSoup(html, "html.parser")
    header = soup.select_one(".productdetails__header__main")
    text = header.get_text(" ", strip=True) if header else ""
    match = re.fullmatch(r"Nissens part number\s+(.+)", text)
    if not match:
        return None, None, SourceResult()
    number = match.group(1)
    sub = soup.select_one(".productdetails__header__sub > span")
    title = sub.get_text(" ", strip=True) if sub else ""
    make = title.partition("|")[0].strip() if "|" in title else None
    result = SourceResult()
    images: dict[int, str] = {}
    for photo in PRODUCT_IMAGE.finditer(html):
        if compact(photo.group(1)) == compact(number):
            images.setdefault(int(photo.group(2)), photo.group(0))
    ordered_images = [images[index] for index in sorted(images)]
    if len(ordered_images) > MAX_PRODUCT_IMAGES:
        step = len(ordered_images) / MAX_PRODUCT_IMAGES
        ordered_images = [ordered_images[int(index * step)] for index in range(MAX_PRODUCT_IMAGES)]
    result.images.extend(
        Image(url=url, kind="photo", record_url=record_url) for url in ordered_images
    )
    seen_attributes: set[tuple[str, str]] = set()
    for row in soup.select(".productdetails__info__info li"):
        label, value = row.select_one(".type"), row.select_one(".value")
        label_text = label.get_text(" ", strip=True) if label else ""
        value_text = value.get_text(" ", strip=True) if value else ""
        if label_text and value_text and label_text != "Date:":
            key = (label_text, value_text)
            if key not in seen_attributes:
                seen_attributes.add(key)
                result.attributes.append(Attribute(name=label_text.rstrip(":"),
                                                   value=value_text, raw_text=f"{label_text} {value_text}"))
    seen_oe: set[str] = set()
    for accordion in soup.select(".productdetails__info__accordion"):
        oe = accordion.select_one("#oe_accordion .type")
        if not oe:
            continue
        label = oe.get_text(" ", strip=True)
        for node in accordion.select(".value"):
            value = node.get_text(" ", strip=True)
            if not value or value in seen_oe:
                continue
            seen_oe.add(value)
            if make:
                result.relationships.append(Relationship(
                    to=NumberRef(make, "oem", value), relation_type="OEM_REFERENCE",
                    raw_relation_text=f"{label}: {value}",
                    record_ref=f"product {number}", record_url=record_url,
                ))
            else:
                result.attributes.append(Attribute(name=label, value=value,
                                                   raw_text=f"{label}: {value}"))
    return number, make, result


class NissensAdapter(Adapter):
    version = "1.0.0"
    min_interval = 5.0
    cross_search = True

    @property
    def source(self) -> SourceMeta:
        return SourceMeta(key="nissens", name="Nissens (каталог виробника)",
                          kind="manufacturer_catalog", license_class="OPEN",
                          lineage="Nissens", url=CATALOG_URL)

    @property
    def brands(self) -> tuple[str, ...]:
        return ("Nissens",)

    def _search_pages(self, field: str, number: str):
        defaults = search_defaults(self.http.fetch(CATALOG_URL))
        page = 0
        seen_pages: set[int] = set()
        for _ in range(MAX_PAGES):
            if page in seen_pages:
                return
            seen_pages.add(page)
            html = self.http.fetch(SEARCH_URL, method="POST", form_body={
                **defaults, "PageNo": str(page), "PageSizeForSearch": str(PAGE_SIZE),
                f"SearchParameters.{field}": number.strip(),
            })
            hits, pages = parse_search(html)
            yield hits
            following = [p for p in pages if p > max(page, 1)]
            if not following:
                return
            page = min(following)

    def _details(self, hit: SearchHit) -> tuple[str | None, str | None, SourceResult]:
        return parse_details(self.http.fetch(DETAIL_URL, method="POST", form_body=hit.detail_params),
                             hit.record_url)

    def lookup(self, request: LookupRequest) -> SourceResult:
        wanted = compact(request.number)
        result = SourceResult()
        if not wanted:
            return result
        seen_applications: set[str] = set()
        contexts: dict[tuple[str, str], SearchHit] = {}
        for page in self._search_pages("NissensNumber", request.number):
            for hit in page:
                if compact(hit.number) != wanted:
                    continue
                key = hit.detail_params["carProductID"]
                if key not in seen_applications and len(result.applications) < MAX_APPLICATIONS:
                    seen_applications.add(key)
                    result.applications.append(hit.application)
                contexts.setdefault((hit.number, hit.application.make), hit)

        seen_crosses: set[tuple[str, str]] = set()
        seen_attributes: set[tuple[str, str]] = set()
        for hit in contexts.values():
            code, make, details = self._details(hit)
            if not code or compact(code) != wanted or (make and make != hit.application.make):
                continue
            for relationship in details.relationships:
                key = (relationship.to.brand, relationship.to.number)
                if key not in seen_crosses and len(result.relationships) < MAX_RELATIONSHIPS:
                    seen_crosses.add(key)
                    result.relationships.append(relationship)
            for attribute in details.attributes:
                key = (attribute.name, attribute.value)
                if key not in seen_attributes and len(result.attributes) < 300:
                    seen_attributes.add(key)
                    result.attributes.append(attribute)
        return result

    def lookup_foreign(self, request: LookupRequest) -> SourceResult:
        wanted = compact(request.number)
        result = SourceResult()
        if len(wanted) < MIN_FOREIGN_NUMBER:
            return result
        seen: set[str] = set()
        checked = 0
        for page in self._search_pages("OeNumber", request.number):
            for hit in page:
                if hit.number in seen or not label_has_brand(hit.application.make, request.brand):
                    continue
                seen.add(hit.number)
                if checked >= MAX_FOREIGN_PRODUCTS:
                    return result
                checked += 1
                code, make, data = self._details(hit)
                if not code or compact(code) != compact(hit.number) or not make:
                    continue
                stated = next((r for r in data.relationships if r.to and compact(r.to.number) == wanted
                               and label_has_brand(r.to.brand, request.brand)), None)
                if stated:
                    result.relationships.append(Relationship(
                        to=NumberRef("Nissens", "aftermarket", code), relation_type="OEM_REFERENCE",
                        direction="incoming", raw_relation_text=stated.raw_relation_text,
                        record_ref=stated.record_ref, record_url=stated.record_url,
                    ))
        return result
