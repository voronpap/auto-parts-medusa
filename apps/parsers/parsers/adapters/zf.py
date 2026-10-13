"""Anonymous ZF catalogue API and its linked public vehicle-application API.

The search is fuzzy. Neither a search hit nor its "Found via" text is a
cross: the article's own labelled reference table must confirm the number.
No login, catalogue-provider key or authenticity-check endpoint is used.
"""
from __future__ import annotations

import re
from typing import Any
from urllib.parse import quote, urlsplit

from ..http import SourceBlocked, SourceError
from ..models import Application, Attribute, NumberRef, Relationship, SourceMeta, SourceResult
from .base import MIN_FOREIGN_NUMBER, Adapter, LookupRequest, label_has_brand, normalize_brand

CATALOG_URL = "https://aftermarket.zf.com/en/catalog/"
API_URL = "https://aftermarket.zf.com/api"
FITMENT_URL = "https://aftermarket.zf.com/functions/controller/opc/getArticleDetailBuildIn"
BRAND_IDS = {"TRW": "161", "SACHS": "32", "LEMFÖRDER": "35", "BOGE": "14", "ZF": "68"}
MAX_RELATIONSHIPS = 450
MAX_APPLICATIONS = 5000
MAX_FOREIGN_PRODUCTS = 5
MAX_SEARCH_PAGES = 3


def _compact(value: str) -> str:
    """Comparison only; the reported number keeps all source separators."""
    return re.sub(r"[^0-9A-Za-z]", "", value).upper()


def _brand(value: str) -> str | None:
    key = normalize_brand(value)
    if key in {"lemforder", "lemfoerder", "lemförder"}:
        return "LEMFÖRDER"
    return next((brand for brand in BRAND_IDS if normalize_brand(brand) == key), None)


def _article_path(href: str) -> str | None:
    """Only the product route supplied by this catalogue, never another host."""
    parsed = urlsplit(href)
    if parsed.scheme or parsed.netloc or not parsed.path.startswith("/products/"):
        return None
    return parsed.path.removeprefix("/products/") or None


def _record_url(number: str, href: str) -> str:
    path = _article_path(href) or quote(number, safe="").replace("%20", "+")
    return f"{CATALOG_URL}products/{path}?country=UA"


def _groups(data: dict[str, Any]):
    content = (data.get("specifications") or {}).get("content") or {}
    for key, relation in (("referenceNumbers", "OEM_REFERENCE"),
                          ("competitorReferences", "COMPETITOR_REFERENCE"),
                          ("alternatives", "MANUFACTURER_INTERCHANGE")):
        section = content.get(key) or {}
        for row in section.get(key) or []:
            yield str(section.get("label") or key), row, relation


def parse_details(data: dict[str, Any], record_url: str) -> SourceResult:
    result = SourceResult()
    details = data.get("details") or {}
    number = str(details.get("number") or "")
    record_ref = f"product {number}"
    content = (data.get("specifications") or {}).get("content") or {}
    if details.get("name"):
        result.attributes.append(Attribute(name="Назва", value=str(details["name"])))
    status = details.get("status") or {}
    if status.get("value"):
        # "No longer deliverable" alone does not assert no replacement exists.
        result.attributes.append(Attribute(name="Status", value=str(status["value"])))
    for row in (details.get("mainStage") or {}).values():
        if isinstance(row, dict) and row.get("label") and row.get("value"):
            result.attributes.append(Attribute(name=str(row["label"]), value=str(row["value"])))
    for row in (content.get("generalSpecifications") or {}).get("specifications") or []:
        for value in row.get("values") or []:
            text = str(value.get("text") or "")
            if row.get("label") and text:
                result.attributes.append(Attribute(name=str(row["label"]), value=text,
                                                   raw_text=f"{row['label']}: {text}"))
    for row in (content.get("additionalInformation") or {}).get("additionalInformation") or []:
        if row.get("label"):
            result.attributes.append(Attribute(name="Additional Information", value=str(row["label"])))
    seen = set()
    for label, row, relation in _groups(data):
        maker = str(row.get("label") or "").strip()
        for value in row.get("values") or []:
            target = str(value.get("text") or "").strip()
            if not target:
                continue
            raw = f"{label}: {maker} {target}".strip()
            if not maker:
                result.attributes.append(Attribute(name=label, value=target, raw_text=raw))
                continue
            key = (maker, target, relation)
            if key in seen:
                continue
            seen.add(key)
            info = value.get("info")
            result.relationships.append(Relationship(
                to=NumberRef(maker, "oem" if relation == "OEM_REFERENCE" else "aftermarket", target),
                relation_type=relation, raw_relation_text=raw,
                constraints={"source_info": info} if info else None,
                record_ref=record_ref, record_url=record_url,
            ))
    return result


def _year(value: Any) -> int | None:
    text = str(value or "")
    return int(text[:4]) if re.fullmatch(r"\d{4}(?:\d{2})?", text) and 1880 <= int(text[:4]) <= 2200 else None


def parse_fitment(data: dict[str, Any], number: str, record_url: str) -> list[Application]:
    applications = []
    for content in data.get("content") or []:
        for maker in content.get("manufacturers") or []:
            make = str((maker.get("manufacturer") or {}).get("name") or "").strip()
            if not make:
                continue
            for model_row in maker.get("models") or []:
                model = model_row.get("model") or {}
                for vehicle_row in model_row.get("vehicles") or []:
                    vehicle = vehicle_row.get("vehicle") or {}
                    criteria = [c for info in vehicle_row.get("articleShortInfos") or []
                                for c in info.get("criterias") or []]
                    conditions = {str(c.get("name") or c.get("criteriaID")): c.get("values")
                                  for c in criteria if c.get("values")}
                    codes = vehicle.get("engineCodes")
                    # Do not manufacture an engine code from displacement or model.
                    engine_code = codes if isinstance(codes, str) else None
                    if isinstance(codes, list) and all(isinstance(c, str) for c in codes):
                        engine_code = ", ".join(codes) or None
                    power = str(vehicle.get("kw") or "")
                    kw = float(power.replace(",", ".")) if re.fullmatch(r"\d+(?:[.,]\d+)?", power) else None
                    position = next((", ".join(str(v) for v in c.get("values") or []) for c in criteria
                                     if c.get("criteriaID") == 100), None)
                    raw = " | ".join(str(piece) for piece in (
                        make, model.get("name"), vehicle.get("name"),
                        vehicle.get("yearOfConstructionFrom"), vehicle.get("yearOfConstructionTo"),
                        f"{power} kW" if power else None, vehicle.get("engineType"),
                        vehicle.get("driveTypeName"), engine_code,
                        *(f"{c.get('name')}: {', '.join(str(v) for v in c.get('values') or [])}" for c in criteria),
                    ) if piece)
                    applications.append(Application(
                        make=make, model=model.get("name") or None,
                        generation=model.get("generationName") or None,
                        engine=vehicle.get("name") or None, engine_code=engine_code,
                        year_from=_year(vehicle.get("yearOfConstructionFrom")),
                        year_to=_year(vehicle.get("yearOfConstructionTo")), power_kw=kw,
                        fuel=vehicle.get("engineType") or None, body=vehicle.get("typeOfBody") or None,
                        drivetrain=vehicle.get("driveTypeName") or None, position=position,
                        constraints=conditions or None, raw_text=raw[:2000],
                        record_ref=f"product {number}; vehicle {vehicle.get('vehicleID', '')}", record_url=record_url,
                    ))
    return applications


class ZfAdapter(Adapter):
    version = "1.0.0"
    min_interval = 5.0
    cross_search = True

    @property
    def source(self) -> SourceMeta:
        return SourceMeta(key="zf", name="ZF / LEMFÖRDER / SACHS / TRW / BOGE (каталог виробника)",
                          kind="manufacturer_catalog", license_class="OPEN", lineage="ZF", url=CATALOG_URL)

    @property
    def brands(self) -> tuple[str, ...]:
        return (*BRAND_IDS, "Lemforder", "Lemfoerder")

    def _search(self, term: str, offset: int = 0) -> dict[str, Any]:
        return self.http.fetch_json(f"{API_URL}/search", params={
            "term": term, "country": "UA", "expand": "extended,special", "ipp": 12,
            "offset": offset, "sort": "relevance", "language": "en", "isValidUser": "false",
        })

    def _details(self, path: str) -> dict[str, Any]:
        data = self.http.fetch_json(f"{API_URL}/articles/{path}", params={
            "expand": "specifications,extended", "country": "UA", "language": "en", "companyConfigId": "",
        })
        if (data.get("meta") or {}).get("isRestricted"):
            raise SourceBlocked("ZF: article requires authorized access")
        if data.get("error"):
            raise SourceError("ZF: article API returned an error")
        return data

    def _linked_relations(self, data: dict[str, Any], number: str, url: str, result: SourceResult) -> None:
        details = data.get("details") or {}
        content = (data.get("specifications") or {}).get("content") or {}
        sections = [(details.get("replacedBy") or {}, "values", "SUPERSEDED_BY", None)]
        sections.extend((content.get(key) or {}, "parts", "CONTAINS", direction)
                        for key, direction in (("partsList", None), ("inPartsList", "incoming")))
        for section, rows_key, relation, direction in sections:
            rows = section.get(rows_key) or []
            values = [(row, value) for row in rows for value in row.get("values") or []] if rows_key == "parts" else [(None, row) for row in rows]
            for row, item in values[:MAX_FOREIGN_PRODUCTS]:
                target = str(item.get("text") or "")
                path = _article_path(str(item.get("href") or ""))
                if not target:
                    continue
                raw = f"{section.get('label')}: {row.get('label') + ' ' if row and row.get('label') else ''}{target}"
                if not path:
                    result.attributes.append(Attribute(name=str(section.get("label") or rows_key), value=target, raw_text=raw))
                    continue
                # These rows name the part type, not the brand. Confirm the
                # target's brand instead of assigning every component to ZF.
                target_details = self._details(path).get("details") or {}
                target_brand = str(target_details.get("brandName") or "")
                if target_brand and _compact(str(target_details.get("number") or "")) == _compact(target):
                    result.relationships.append(Relationship(
                        to=NumberRef(target_brand, "aftermarket", target), relation_type=relation,
                        direction=direction, raw_relation_text=raw,
                        record_ref=f"product {number}", record_url=url,
                    ))
            if section.get("isLimitedCount") or len(values) > MAX_FOREIGN_PRODUCTS:
                result.attributes.append(Attribute(name=str(section.get("label") or rows_key),
                                                   value=f"частковий перелік; перевірено до {MAX_FOREIGN_PRODUCTS} номерів"))

    def lookup(self, request: LookupRequest) -> SourceResult:
        wanted, brand = _compact(request.number), _brand(request.brand)
        if not wanted or not brand:
            return SourceResult()
        hit = None
        for page in range(MAX_SEARCH_PAGES):
            found = self._search(wanted, page * 12).get("products") or {}
            hit = next((item for item in found.get("items") or []
                        if _compact(str(item.get("productNumber") or "")) == wanted
                        and _brand(str(item.get("brandName") or "")) == brand), None)
            if hit or (found.get("pagination") or {}).get("totalItems", 0) <= (page + 1) * 12:
                break
        path = _article_path(str((hit or {}).get("productDetailsPageHref") or ""))
        if not path:
            return SourceResult()
        data = self._details(path)
        details = data.get("details") or {}
        number = str(details.get("number") or "")
        if _compact(number) != wanted or _brand(str(details.get("brandName") or "")) != brand:
            return SourceResult()
        url = _record_url(number, str(hit["productDetailsPageHref"]))
        result = parse_details(data, url)
        self._linked_relations(data, number, url, result)
        if not self.skip_fitment:
            fitment = self.http.fetch_json(FITMENT_URL, params={
                "articleID": number, "languageID": 4, "brandIDs": BRAND_IDS[brand], "countryID": "UA",
            }, headers={"X-Requested-With": "XMLHttpRequest"})
            result.applications = parse_fitment(fitment, number, url)
        for values, limit, label in ((result.relationships, MAX_RELATIONSHIPS, "Кроси"),
                                     (result.applications, MAX_APPLICATIONS, "Застосовність"),
                                     (result.attributes, 295, "Характеристики")):
            if len(values) > limit:
                total = len(values)
                del values[limit:]
                result.attributes.append(Attribute(name=f"{label} у каталозі", value=f"показано {limit} з {total}"))
        return result

    def lookup_foreign(self, request: LookupRequest) -> SourceResult:
        wanted = _compact(request.number)
        result = SourceResult()
        if len(wanted) < MIN_FOREIGN_NUMBER:
            return result
        candidates = [item for item in (self._search(wanted).get("products") or {}).get("items") or []
                      if _brand(str(item.get("brandName") or ""))]
        for item in candidates[:MAX_FOREIGN_PRODUCTS]:
            path = _article_path(str(item.get("productDetailsPageHref") or ""))
            if not path:
                continue
            data = self._details(path)
            details = data.get("details") or {}
            number, brand = str(details.get("number") or ""), str(details.get("brandName") or "")
            if (_compact(number) != _compact(str(item.get("productNumber") or ""))
                    or _brand(brand) != _brand(str(item.get("brandName") or ""))):
                continue
            for label, row, relation in _groups(data):
                maker = str(row.get("label") or "")
                if not label_has_brand(maker, request.brand):
                    continue
                value = next((str(v.get("text") or "") for v in row.get("values") or []
                              if _compact(str(v.get("text") or "")) == wanted), None)
                if value is not None:
                    result.relationships.append(Relationship(
                        to=NumberRef(brand, "aftermarket", number), relation_type=relation, direction="incoming",
                        raw_relation_text=f"{label}: {maker} {value}",
                        record_ref=f"product {number}",
                        record_url=_record_url(number, str(item["productDetailsPageHref"])),
                    ))
                    break
        return result
