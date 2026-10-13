"""GMB's anonymous catalogue and its own PIES/ACES WordPress endpoint.

The page declares a transport part_number, which is not necessarily its SKU.
Both the page SKU and the JSON's named manufacturer/part identity are checked.
PIES interchanges are references, not guessed replacements or quality verdicts.
ACES rows are retained separately; the UI's min/max year aggregation is not used.
"""
from __future__ import annotations

import json
import re
from urllib.parse import parse_qs, unquote, urljoin, urlsplit

from bs4 import BeautifulSoup

from ..http import SourceError
from ..models import Application, Attribute, NumberRef, Relationship, SourceMeta, SourceResult
from .base import Adapter, LookupRequest, normalize_brand
from .mann_hummel import _is_vehicle_maker

BASE_URL = "https://gmb.net"
CATALOG_URL = BASE_URL + "/catalog/"
AJAX_URL = BASE_URL + "/wp-admin/admin-ajax.php"
MAX_SEARCH_PAGES = 10


def compact(value):
    return re.sub(r"[^A-Za-z0-9]", "", value or "").upper()


def raw(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def product_links(html):
    soup = BeautifulSoup(html, "html.parser")
    found = {}
    for link in soup.select('.fl-post-feed-title a[href], a.woocommerce-LoopProduct-link[href]'):
        url = urljoin(BASE_URL, link.get("href", ""))
        address = urlsplit(url)
        if address.scheme != "https" or address.hostname != "gmb.net" or address.query:
            continue
        match = re.fullmatch(r"/product/([A-Za-z0-9-]+)/?", address.path)
        title = link.get_text(" ", strip=True)
        if not match or not title:
            continue
        slug = unquote(match[1])
        # The code is visibly printed, not inferred from an internal URL ID.
        number = title[-len(slug):]
        prefix = title[:-len(slug)]
        if number.casefold() != slug.casefold() or (prefix and not prefix.endswith(" ")):
            continue
        found[url] = (number, title, url)
    return list(found.values())


def bootstrap(html):
    soup = BeautifulSoup(html, "html.parser")
    sku = soup.select_one('.product_meta .sku')
    title = soup.select_one('h1.product_title')
    if not sku or not title or not sku.get_text(strip=True):
        raise SourceError("GMB product SKU/title is missing")
    number = sku.get_text(strip=True)
    text = "\n".join(s.get_text() for s in soup.select('script:not([src])')
                     if "opticat_ajax_lookup" in s.get_text() and "part_details" in s.get_text())
    def declared(name):
        values = set(re.findall(r"(?m)^\s*(?:var|let|const)\s+" + name + r"\s*=\s*['\"]([^'\"\r\n]+)['\"]\s*;", text))
        if len(values) != 1:
            raise SourceError("GMB native request configuration changed")
        return values.pop()
    transport, brand_code = declared("part_number"), declared("brand_code")
    if not 1 <= len(transport) <= 120 or any(ord(c) < 32 for c in transport) or not re.fullmatch(r"[A-Za-z0-9]{1,20}", brand_code):
        raise SourceError("GMB transport identifiers are invalid")
    return number, title.get_text(" ", strip=True), transport, brand_code


def _item(data, number, brand_code):
    if not isinstance(data, dict) or data.get("status") != 200 or not isinstance(data.get("piesItem"), dict):
        raise SourceError("GMB did not return a complete PIES item")
    item = data["piesItem"]
    if (not isinstance(item.get("partNumber"), str) or not 1 <= len(item["partNumber"]) <= 100
            or compact(item["partNumber"]) != compact(number)
            or normalize_brand(str(item.get("brandName", ""))) != "gmb" or item.get("brandCode") != brand_code):
        raise SourceError("GMB PIES manufacturer/part identity mismatch")
    if not isinstance(item.get("hasACESApplications"), bool):
        raise SourceError("GMB ACES availability flag is missing or changed")
    return item


def _entries(item, field):
    value = item.get(field)
    if value is None:
        return []
    if not isinstance(value, list):
        raise SourceError(f"GMB {field} list structure changed")
    return value


def parse_details(data, number, brand_code, record_url):
    item = _item(data, number, brand_code)
    result = SourceResult()
    def attribute(name, value, evidence, unit=None):
        if value is not None and value != "":
            value = value if isinstance(value, str) else raw(value)
            chunks = [value[i:i + 500] for i in range(0, len(value), 500)]
            text = raw(evidence)
            for i, chunk in enumerate(chunks, 1):
                label = name if len(chunks) == 1 else f"{name} (text fragment {i}/{len(chunks)})"
                if len(label) > 200:
                    raise SourceError("GMB attribute name exceeds the exchange format limit")
                # A fragment is literal source text, not an ellipsis/truncation.
                result.attributes.append(Attribute(label, chunk, unit=unit,
                    raw_text=text if len(text) <= 2000 else chunk))
    def fields(prefix, value, evidence, unit=None):
        if isinstance(value, dict) and value:
            unit = value.get("uomName", unit)
            for key, child in value.items():
                fields(prefix + "." + key, child, evidence, None if key in {"uomCode", "uomName"} else unit)
        elif isinstance(value, list) and value:
            for i, child in enumerate(value, 1):
                fields(prefix + f"[{i}]", child, evidence, unit)
        else:
            attribute(prefix, value, evidence, unit)
    attribute("Part Number", item["partNumber"], {"partNumber": item["partNumber"]})
    attribute("Part Type", item.get("partTypeName"), {"partTypeName": item.get("partTypeName")})
    for field, label in [("categoryName", "Category"), ("subCategoryName", "Subcategory")]:
        attribute(label, item.get(field), {field: item.get(field)})
    for entry in _entries(item, "productAttributes"):
        if not isinstance(entry, dict):
            raise SourceError("GMB product attribute structure changed")
        name = entry.get("padbAttributeName") or entry.get("attributeId")
        if name:
            attribute(str(name), entry.get("value"), entry)
    for entry in _entries(item, "extendedInformation"):
        if not isinstance(entry, dict):
            raise SourceError("GMB extended information structure changed")
        if entry.get("expiName"):
            attribute(entry["expiName"], entry.get("formattedValue", entry.get("value")), entry)
    for entry in _entries(item, "descriptions"):
        if not isinstance(entry, dict):
            raise SourceError("GMB description structure changed")
        if entry.get("languageCode") == "EN" and entry.get("descriptionTypeName"):
            attribute(entry["descriptionTypeName"] + " (EN)", entry.get("value"), entry)
    for label, field in [("Item quantity size", "itemQuantitySize"), ("Quantity per application", "quantityPerApplication")]:
        entry = item.get(field)
        if isinstance(entry, dict):
            attribute(label, entry.get("value"), entry, entry.get("uomName"))
    for i, entry in enumerate(_entries(item, "packages"), 1):
        # Shipping dimensions and case barcodes are not part dimensions/IDs.
        fields(f"Package {i}", entry, entry)
    for i, entry in enumerate(_entries(item, "kits"), 1):
        # Do not invent numbered contents from a kit's name or undocumented
        # kit record direction. Keep any unmodelled kit record literally.
        fields(f"Kit record {i} (unmapped)", entry, entry)
    for entry in _entries(item, "partInterchanges"):
        if not isinstance(entry, dict):
            raise SourceError("GMB interchange structure changed")
        brand, code = entry.get("brandName"), entry.get("partNumber")
        if not isinstance(brand, str) or not brand.strip() or not isinstance(code, str) or not code.strip():
            fields("Unlabelled interchange (unmapped)", entry, entry)
            continue
        if normalize_brand(brand) == "gmb" and compact(code) == compact(number):
            continue
        oem, own = _is_vehicle_maker(brand), normalize_brand(brand) == "gmb"
        # Named vehicle-maker namespaces are OEM references; other named
        # companies remain references, not asserted exact aftermarket crosses.
        result.relationships.append(Relationship(
            NumberRef(brand, "oem" if oem else "aftermarket" if own else "competitor", code),
            "OEM_REFERENCE" if oem else "MANUFACTURER_INTERCHANGE" if own else "COMPETITOR_REFERENCE",
            raw_relation_text=raw({k: v for k, v in entry.items() if k != "brandAdditionalInfo"}),
            ambiguous=not oem,
            reason=None if oem else "PIES comparison reference; interchange/quality codes are retained without guessing exact equivalence",
            record_ref=f"GMB {number}; PIES partInterchanges", record_url=record_url,
        ))
    gtin = item.get("itemLevelGTIN")
    if isinstance(gtin, dict) and isinstance(gtin.get("gtin"), str) and gtin["gtin"].strip():
        result.relationships.append(Relationship(NumberRef("GMB", "gtin", gtin["gtin"]), "GTIN_IDENTIFIER",
            raw_relation_text=raw(gtin), record_ref=f"GMB {number}; PIES itemLevelGTIN", record_url=record_url))
    if len(result.relationships) > 450 or len(result.attributes) > 300:
        raise SourceError("GMB item exceeds the exchange format limits")
    return item, result


def vehicle_pairs(data):
    if not isinstance(data, dict) or data.get("success") is not True or not isinstance(data.get("data"), dict):
        raise SourceError("GMB application table response is invalid")
    html = data["data"].get("html")
    if not isinstance(html, str):
        raise SourceError("GMB application table is missing")
    soup = BeautifulSoup(html, "html.parser")
    table = soup.select_one('table.opt-guide-table')
    if not table or [t.get_text(strip=True) for t in table.select('thead th')] != ["Year", "Make", "Model", "Engine", "Position", "Note"]:
        raise SourceError("GMB application table headings changed")
    pairs = set()
    for row in table.select('tbody tr'):
        cells = row.find_all('td', recursive=False)
        if len(cells) != 6:
            raise SourceError("GMB application table columns changed")
        make, model = (cells[i].get_text(" ", strip=True) for i in (1, 2))
        if not make or not model:
            raise SourceError("GMB application make/model is missing")
        pairs.add((make, model))
    return pairs


def parse_applications(data, number, brand_code, pairs, record_url, resolve_vehicle=None):
    if not isinstance(data, list) or len(data) > 5000:
        raise SourceError("GMB ACES applications are invalid or exceed the format limit")
    results = []
    for record in data:
        app = record.get("acesApp") if isinstance(record, dict) else None
        if (not isinstance(app, dict) or compact(str(app.get("partNumber", ""))) != compact(number)
                or normalize_brand(str(app.get("brandName", ""))) != "gmb" or app.get("brandCode") != brand_code):
            raise SourceError("GMB ACES manufacturer/part identity mismatch")
        name = app.get("baseVehicleName")
        match = re.fullmatch(r"(\d{4})\s+(.+)", name or "")
        if not match:
            raise SourceError("GMB ACES vehicle name/year format changed")
        year, vehicle = int(match[1]), match[2]
        matches = [(make, model) for make, model in pairs if (make + " " + model) == vehicle]
        if len(matches) == 1:
            make, model = matches[0]
        elif resolve_vehicle:
            make, model = resolve_vehicle(year, app.get("baseVehicleId"), vehicle)
        else:
            raise SourceError("GMB vehicle name cannot be split using source-labelled make/model")
        if make + " " + model != vehicle:
            raise SourceError("GMB resolved vehicle ID conflicts with its ACES name")
        if app.get("years") and any(str(y) != str(year) for y in app["years"]):
            raise SourceError("GMB ACES year list conflicts with its base vehicle year")
        attributes = app.get("attributes", [])
        if not isinstance(attributes, list) or any(not isinstance(x, dict) for x in attributes):
            raise SourceError("GMB ACES attribute structure changed")
        fields = {}
        mapping = {"EngineBaseId": "engine", "FuelTypeId": "fuel", "DriveTypeId": "drivetrain",
                   "BodyTypeId": "body", "RegionId": "market", "TransmissionTypeId": "transmission",
                   "PositionId": "position", "SideId": "side", "EngineCodeId": "engine_code"}
        other_attributes = []
        for entry in attributes:
            field = mapping.get(entry.get("attributeType"))
            value = entry.get("attributeValueName")
            if field and isinstance(value, str) and value:
                if field in fields and fields[field] != value:
                    raise SourceError("GMB has conflicting ACES attribute values")
                fields[field] = value
            else:
                other_attributes.append(entry)
        quantity = app.get("qty")
        quantity = float(quantity) if re.fullmatch(r"\d+(?:\.\d+)?", str(quantity if quantity is not None else "")) else None
        context = {k: app[k] for k in ("notes", "quals") if app.get(k)}
        if other_attributes:
            context["source_attributes"] = other_attributes
        if record.get("matchingBaseVehicles"):
            context["matchingBaseVehicles"] = record["matchingBaseVehicles"]
        evidence = raw(record)
        results.append(Application(make=make, model=model, year_from=year, year_to=year, quantity=quantity,
            **fields, constraints=context or None, raw_text=evidence if len(evidence) <= 2000 else name,
            record_ref=f"GMB {number}; ACES baseVehicleId={app.get('baseVehicleId')}", record_url=record_url))
    return results


class GmbAdapter(Adapter):
    source = SourceMeta(key="gmb", name="GMB (каталог виробника)", kind="manufacturer_catalog",
                        license_class="OPEN", lineage="GMB", url=CATALOG_URL)
    brands = ("GMB",)
    version = "1.0.0"
    min_interval = 5.0
    # Native number search did not find the verified Volkswagen OE number.
    cross_search = False

    def _pace(self):
        if hasattr(self.http, "limiter"):
            self.http.limiter.set_interval("gmb.net", 5.0)

    def _fetch(self, url, **kwargs):
        self._pace()
        return self.http.fetch(url, **kwargs)

    def _json(self, **params):
        self._pace()
        return self.http.fetch_json(AJAX_URL, params={"action": "opticat_ajax_lookup", **params})

    def _search(self, number, first_page_only=False):
        url, params = BASE_URL + "/", {"s": number}
        seen = set()
        for _ in range(1 if first_page_only else MAX_SEARCH_PAGES):
            html = self._fetch(url, params=params)
            soup = BeautifulSoup(html, "html.parser")
            if not soup.title or "GMB" not in soup.title.get_text() or not any(
                    h.get_text(" ", strip=True).startswith("Search Results:") for h in soup.select('h1')):
                raise SourceError("GMB native search page identity is missing")
            matches = [p for p in product_links(html) if compact(p[0]) == compact(number)]
            if matches:
                return matches
            next_page = soup.select_one('a.next.page-numbers[href]')
            if first_page_only or not next_page:
                return []
            url = urljoin(BASE_URL, next_page["href"])
            address = urlsplit(url)
            if (address.scheme != "https" or address.hostname != "gmb.net" or url in seen
                    or parse_qs(address.query).get("s") != [number]):
                raise SourceError("GMB search pagination is invalid")
            seen.add(url)
            params = None
        raise SourceError("GMB native search page limit reached")

    def identify(self, number):
        if not 5 <= len(compact(number)) <= 100:
            return []
        return [{"brand": "GMB", "number": code, "title": title}
                for code, title, _ in self._search(number, first_page_only=True)]

    def _vehicle(self, year, base_id, name):
        makes = self._json(lookup="make", year=str(year), make="", model="", engine="")
        if not isinstance(makes, list):
            raise SourceError("GMB vehicle make list is invalid")
        for make in makes:
            label = make.get("makeName") if isinstance(make, dict) else None
            if not isinstance(label, str) or not name.startswith(label + " "):
                continue
            models = self._json(lookup="model", year=str(year), make=str(make.get("makeId")), model="", engine="")
            if not isinstance(models, list):
                raise SourceError("GMB vehicle model list is invalid")
            names = {x.get("modelName") for x in models if isinstance(x, dict)
                     and str(x.get("baseVehicleId")) == str(base_id) and isinstance(x.get("modelName"), str)}
            if len(names) == 1:
                return label, names.pop()
        raise SourceError("GMB source vehicle ID could not be resolved")

    def lookup(self, request: LookupRequest):
        if not self.supports(request) or not 5 <= len(compact(request.number)) <= 100:
            return SourceResult()
        matches = self._search(request.number)
        if not matches:
            return SourceResult()
        if len(matches) != 1:
            raise SourceError("GMB number has multiple source product identities")
        _, _, url = matches[0]
        number, title, transport, brand = bootstrap(self._fetch(url))
        if compact(number) != compact(request.number):
            raise SourceError("GMB product SKU differs from the requested number")
        params = {"part_number": transport, "brand_code": brand}
        details = self._json(**params, lookup="part_details", php="0")
        item, result = parse_details(details, number, brand, url)
        if item.get("hasACESApplications") and not self.skip_fitment:
            data = self._json(**params, lookup="applications", php="0")
            table = self._json(**params, lookup="applications", php="1")
            if not data:
                raise SourceError("GMB declares ACES applications but returned no records")
            result.applications = parse_applications(data, number, brand, vehicle_pairs(table), url, self._vehicle)
        return result
