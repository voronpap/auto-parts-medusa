"""Budweg's public HTML catalogue; no account or installation-file requests.

OE rows do not name manufacturers. Fitment makes supply only ambiguous
namespaces, never confirmed OE ownership or a foreign-number match.
Partlist and Compatible calipers are retained literally, not guessed kit
contents or analogues. Caliper vehicle IDs are resolved only by an exact
displayed-description match to source-labelled sparepart filter links.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import parse_qs, urlencode, urljoin, urlsplit

from bs4 import BeautifulSoup

from ..http import SourceError
from ..models import Application, Attribute, NumberRef, Relationship, SourceMeta, SourceResult
from .base import Adapter, LookupRequest

BASE_URL = "https://budweg-catalog.com"
CATALOG_URL = BASE_URL + "/catalogue/"
PRODUCT_URL = BASE_URL + "/product/"
MAX_TAB_PAGES = 500
MAX_BINDING_PRODUCTS = 10
TAB_QUERIES = {"Compatible applications": "compatible-applications", "Compatible calipers": "compatible-caliper"}
FILTER_FIELDS = ("brand", "model", "engine", "fromYear", "fuel", "model_code")


def compact(value):
    return re.sub(r"[\s-]+", "", value).upper()


def valid_number(value):
    return bool(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9 .-]{0,99}", value) and compact(value) != "0")


def description(value):
    return " ".join(value.split())


def address(href):
    # Query-only vehicle links are relative to the product document, not /.
    url = urljoin(PRODUCT_URL, href)
    parsed = urlsplit(url)
    if parsed.scheme != "https" or parsed.netloc != "budweg-catalog.com" or parsed.fragment:
        raise SourceError("Budweg link leaves its public catalogue")
    return url, parsed, parse_qs(parsed.query, keep_blank_values=True)


def product_number(link):
    _, parsed, params = address(link.get("href", ""))
    code = link.get_text(" ", strip=True)
    if parsed.path != "/product/" or params.get("article") != [code]:
        raise SourceError("Budweg visible article differs from its product link")
    return code


@dataclass
class Product:
    number: str
    title: str
    kind: str
    soup: BeautifulSoup
    tabs: dict
    info: list
    makes: list
    fuels: dict
    url: str


def parse_product(html, expected, url=PRODUCT_URL):
    soup = BeautifulSoup(html, "html.parser")
    if not soup.title or "Budweg" not in soup.title.get_text():
        raise SourceError("Budweg page identity is missing")
    wrap = soup.select_one(".catalog-right .product-type-wrap")
    title = soup.select_one(".catalog-right .catalog-title")
    if not wrap or not title or not wrap.select_one(".type-text"):
        raise SourceError("Budweg product identity is missing")
    direct = "".join(wrap.find_all(string=True, recursive=False)).strip()
    match = re.fullmatch(r"Budweg No:\s*(.+)", direct)
    if not match or not valid_number(match[1]) or compact(match[1]) != compact(expected):
        raise SourceError("Budweg published article identity mismatch")
    kind = wrap.select_one(".type-text").get_text(" ", strip=True)
    if kind not in {"Caliper", "Sparepart"}:
        raise SourceError("Budweg product type changed")
    tabs = {}
    for heading in soup.select(".catalog-right .tabs-head .tab-name[data-tab]"):
        label = heading.get_text(" ", strip=True)
        key = heading["data-tab"]
        if not re.fullmatch(r"mtab[0-9]+", key) or label in tabs:
            raise SourceError("Budweg tab identity changed")
        panel = soup.select_one(".catalog-right .tab-content." + key)
        if panel is None:
            raise SourceError("Budweg declared tab is missing")
        tabs[label] = panel
    known = {"Product info", "Partlist", "OE numbers", "Compatible calipers", "Compatible applications"}
    if "Product info" not in tabs or set(tabs) - known:
        raise SourceError("Budweg tab structure changed")
    table = tabs["Product info"].select_one("table.product-table")
    if table is None:
        raise SourceError("Budweg product information is missing")
    info = []
    for row in table.select("tr"):
        cells = row.find_all("td", recursive=False)
        if len(cells) == 1 and cells[0].get("colspan") == "2" and cells[0].select_one("a[download]"):
            continue  # Do not fetch installation PDFs.
        if len(cells) != 2:
            raise SourceError("Budweg product information columns changed")
        name, value = (x.get_text(" ", strip=True) for x in cells)
        if not name or not value:
            raise SourceError("Budweg product information field is empty")
        info.append((name, value, row.get_text(" ", strip=True)))
    makes = [x.get_text(" ", strip=True) for x in soup.select('select[name="brand"] option[value]') if x.get("value")]
    fuels = {x["value"]: x.get_text(" ", strip=True) for x in soup.select('select[name="fuel"] option[value]') if x["value"]}
    return Product(match[1], title.get_text(" ", strip=True), kind, soup, tabs, info, makes, fuels, url)


def rows(product, label):
    panel = product.tabs.get(label)
    if panel is None:
        return []
    holder = panel.select_one(".table-rows")
    if holder is None:
        raise SourceError("Budweg tab rows changed")
    return holder.select(":scope > .table-row")


def labelled_filter(row):
    link = row.select_one("a[href]")
    if link is None:
        raise SourceError("Budweg application link is missing")
    _, parsed, params = address(link["href"])
    if parsed.path == "/product/":
        if len(params.get("article", [])) != 1 or len(params.get("car", [])) != 1 or not re.fullmatch(r"[0-9]+", params["car"][0]):
            raise SourceError("Budweg caliper vehicle identity is missing")
        return None
    if (parsed.path != "/catalogue/" or set(params) - set(FILTER_FIELDS) - {"search"}
            or any(len(params.get(k, [])) != 1 for k in FILTER_FIELDS)):
        raise SourceError("Budweg source-labelled application filter changed")
    fields = {k: params[k][0] for k in FILTER_FIELDS}
    if not fields["brand"] or not fields["model"]:
        raise SourceError("Budweg labelled application make/model is missing")
    return fields


def parse_application(row, fields, product, url, reference, binding_url=None):
    text = row.get_text(" ", strip=True)
    if len(text) > 2000:
        raise SourceError("Budweg application text exceeds the exchange format limit")
    dates = re.search(r"(\d{1,2})/(\d{4})\s*-\s*(?:(\d{1,2})/(\d{4}))?(?:\s*-\s*(.*))?$", text)
    if not dates or any(not 1 <= int(dates[i]) <= 12 for i in (1, 3) if dates[i]):
        raise SourceError("Budweg application date format changed")
    year_from, year_to = int(dates[2]), int(dates[4]) if dates[4] else None
    if fields["fromYear"] != str(year_from):
        raise SourceError("Budweg application filter conflicts with its printed year")
    before_dates = text[:dates.start()].rstrip()
    suffix = re.search(r"\s+" + re.escape(fields["engine"]) + r"\s+" + re.escape(fields["fuel"]) + r"$", before_dates)
    if not fields["engine"] or not fields["fuel"] or not suffix:
        raise SourceError("Budweg application engine/fuel conflicts with its labelled filter")
    before_engine = before_dates[:suffix.start()]
    expected = " ".join(fields[k] for k in ("brand", "model", "model_code") if fields[k])
    heading = re.match(re.escape(expected).replace(r"\ ", r"\s+") + r"\s+", before_engine)
    if heading is None:
        raise SourceError("Budweg application model/variant conflicts with its labelled filter")
    remainder = before_engine[heading.end():].strip()
    annotations = []
    while re.match(r"^\([^()]+\)\s+", remainder):
        annotation = re.match(r"^\([^()]+\)\s+", remainder)
        annotations.append(annotation[0].strip())
        remainder = remainder[annotation.end():]
    if product.makes and fields["brand"] not in product.makes:
        raise SourceError("Budweg application manufacturer is not a published source option")
    context = {"source_filter": fields, "month_from": int(dates[1]), "month_to": int(dates[3]) if dates[3] else None}
    if annotations:
        context["source_vehicle_annotations"] = annotations  # Not guessed generations/engine codes.
    if dates[5]:
        context["source_tail"] = dates[5]
    link = row.select_one("a[href]")
    _, _, params = address(link["href"])
    if params.get("car"):
        context["source_vehicle_id"] = params["car"][0]
    if binding_url:
        context["source_labelled_vehicle_record"] = binding_url
    position = next((value for name, value, _ in product.info if name == "Position"), None)
    return Application(make=fields["brand"], model=fields["model"], body=remainder or None,
        engine=fields["engine"], fuel=product.fuels.get(fields["fuel"], fields["fuel"]),
        year_from=year_from, year_to=year_to, position=position, constraints=context,
        raw_text=text, record_ref=reference, record_url=url)


def add_attribute(result, name, value, evidence, unit=None):
    chunks = [value[i:i + 500] for i in range(0, len(value), 500)]
    for i, chunk in enumerate(chunks, 1):
        label = name if len(chunks) == 1 else f"{name} (text fragment {i}/{len(chunks)})"
        if len(label) > 200:
            raise SourceError("Budweg attribute name exceeds the exchange format limit")
        result.attributes.append(Attribute(label, chunk, unit=unit, raw_text=evidence if len(evidence) <= 2000 else chunk))


class BudwegAdapter(Adapter):
    source = SourceMeta(key="budweg", name="Budweg Caliper (каталог виробника)", kind="manufacturer_catalog",
                        license_class="OPEN", lineage="Budweg Caliper", url=CATALOG_URL)
    brands = ("Budweg Caliper", "Budweg")
    version = "1.0.0"
    min_interval = 5.0
    # Native OE search exists, but its OE rows do not label manufacturers.
    cross_search = False

    def _fetch(self, url, **kwargs):
        if hasattr(self.http, "limiter"):
            self.http.limiter.set_interval("budweg-catalog.com", 5.0)
        return self.http.fetch(url, **kwargs)

    def _product(self, number):
        return parse_product(self._fetch(PRODUCT_URL, params={"article": number}), number,
                             PRODUCT_URL + "?" + urlencode({"article": number}))

    def _all_rows(self, product, label):
        if label not in product.tabs:
            return []
        first, current, output, seen = product, product, [], set()
        for page in range(1, MAX_TAB_PAGES + 1):
            panel = current.tabs.get(label)
            if panel is None:
                raise SourceError("Budweg paginated tab disappeared")
            output.extend((row, current.url, page, i) for i, row in enumerate(rows(current, label), 1))
            if len(output) > 5000:
                raise SourceError("Budweg tab exceeds the exchange format record limit")
            marker = panel.select_one(".pagination .page-numbers.current")
            if marker and marker.get_text(strip=True) != str(page):
                raise SourceError("Budweg pagination returned the wrong page")
            next_link = panel.select_one(".pagination a.next.page-numbers[href]")
            if next_link is None:
                later = [x for x in panel.select(".pagination a.page-numbers[href]")
                         if x.get_text(strip=True).isdigit() and int(x.get_text(strip=True)) > page]
                if later:
                    raise SourceError("Budweg pagination advertises later records but lacks its next link")
                return output
            if page == MAX_TAB_PAGES:
                raise SourceError("Budweg tab pagination limit reached")
            url, parsed, params = address(next_link["href"])
            if (label not in TAB_QUERIES or parsed.path != f"/product/page/{page + 1}/"
                    or params.get("article") != [first.number] or params.get("product-tab") != [TAB_QUERIES[label]]
                    or set(params) != {"article", "product-tab"} or url in seen):
                raise SourceError("Budweg tab pagination is invalid")
            seen.add(url)
            current = parse_product(self._fetch(url), first.number, url)
            if current.kind != first.kind or current.title != first.title:
                raise SourceError("Budweg product changed while paging its records")
        raise SourceError("Budweg tab pagination limit reached")

    def _make(self, row, product):
        text = row.get_text(" ", strip=True)
        matches = [label for label in product.makes if text.startswith(label + " ")]
        if not matches:
            raise SourceError("Budweg application make cannot be resolved from published labels")
        return max(matches, key=len)

    def _applications(self, product, applications, parts):
        bindings = {}
        unresolved = set()
        for row, _, _, _ in applications:
            if labelled_filter(row) is None:
                _, _, params = address(row.select_one("a[href]")["href"])
                if params["article"] != [product.number]:
                    raise SourceError("Budweg application points to another article")
                unresolved.add(description(row.get_text(" ", strip=True)))
        candidates = []
        for row, _, _, _ in parts:
            link = row.select_one("a[href]")
            if link:
                code = product_number(link)
                if valid_number(code) and compact(code) != compact(product.number) and code not in candidates:
                    candidates.append(code)
        for code in candidates[:MAX_BINDING_PRODUCTS]:
            if not unresolved:
                break
            related = self._product(code)
            if related.kind != "Sparepart":
                continue
            # Read all related pages before accepting a unique caption binding.
            # These describe fields of already-listed vehicles, not new fitments.
            for row, url, _, _ in self._all_rows(related, "Compatible applications"):
                key = description(row.get_text(" ", strip=True))
                if key not in unresolved:
                    continue
                fields = labelled_filter(row)
                if fields is None:
                    continue
                signature = tuple(fields[k] for k in FILTER_FIELDS)
                if key in bindings and bindings[key][0] != signature:
                    raise SourceError("Budweg vehicle caption has conflicting source-labelled identities")
                bindings[key] = (signature, fields, url)
            unresolved -= set(bindings)
        if unresolved:
            raise SourceError("Budweg caliper vehicle IDs lack a unique source-labelled make/model binding")
        result = []
        for row, url, page, index in applications:
            fields = labelled_filter(row)
            binding_url = None
            if fields is None:
                _, fields, binding_url = bindings[description(row.get_text(" ", strip=True))]
            result.append(parse_application(row, fields, product, url,
                f"Budweg {product.number}; Compatible applications page {page}, row {index}", binding_url))
        return result

    def identify(self, number):
        if not valid_number(number) or len(compact(number)) < 5:
            return []
        product = self._product(number)
        return [{"brand": "Budweg Caliper", "number": product.number, "title": product.title}]

    def lookup(self, request: LookupRequest):
        if not self.supports(request) or not valid_number(request.number):
            return SourceResult()
        product = self._product(request.number)
        result = SourceResult()
        add_attribute(result, "Budweg No", product.number, "Budweg No: " + product.number)
        add_attribute(result, "Product", product.title, product.title)
        add_attribute(result, "Product type", product.kind, product.kind)
        for name, value, evidence in product.info:
            unit = re.search(r"\[([^\]]+)\]$", name)
            add_attribute(result, name, value, evidence, unit[1] if unit else None)
            if name == "EAN Code":
                result.relationships.append(Relationship(NumberRef("Budweg Caliper", "gtin", value), "GTIN_IDENTIFIER",
                    raw_relation_text=evidence, record_ref=f"Budweg {product.number}; Product info", record_url=product.url))
        parts = self._all_rows(product, "Partlist")
        calipers = self._all_rows(product, "Compatible calipers")
        for label, records in [("Partlist", parts), ("Compatible calipers", calipers)]:
            for row, _, _, _ in records:
                link = row.select_one("a[href]")
                if link:
                    product_number(link)
                text = row.get_text(" ", strip=True)
                add_attribute(result, label + " (unmapped service reference)", text, label + "\n" + text)
        oe_rows = self._all_rows(product, "OE numbers")
        # Unlabelled OE namespaces require every fitment page, even when the
        # caller omits structured fitment. Never use just the first page's make.
        applications = self._all_rows(product, "Compatible applications") if oe_rows or not self.skip_fitment else []
        makes = sorted({self._make(row, product) for row, _, _, _ in applications}) if oe_rows else []
        for row, url, page, index in oe_rows:
            code = row.get_text(" ", strip=True)
            if not code:
                raise SourceError("Budweg OE row is empty")
            text = "OE numbers\n" + code
            add_attribute(result, "OE numbers (manufacturer unlabelled)", code, text)
            for make in makes:
                result.relationships.append(Relationship(NumberRef(make, "oem", code), "OEM_REFERENCE",
                    raw_relation_text=text, ambiguous=True,
                    reason="OE table does not name a manufacturer; namespace is only a fitted-make candidate, not confirmed ownership",
                    record_ref=f"Budweg {product.number}; OE numbers page {page}, row {index}", record_url=url))
        if not self.skip_fitment:
            result.applications = self._applications(product, applications, parts)
        if len(result.relationships) > 500 or len(result.attributes) > 300:
            raise SourceError("Budweg result exceeds the exchange format limits")
        return result
