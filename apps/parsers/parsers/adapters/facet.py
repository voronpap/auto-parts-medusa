"""FACET public product JSON plus catalogue HTML callbacks.

Only the ordinary read-only catalogue actions are used. The unrelated
PDF-by-email captcha, email sender and history/account endpoints are never
called. Literal callback state is echoed, not evaluated or deserialized as
.NET objects. Similar types and supersessions of third-party references do
not become replacements of the requested own part.
"""
from __future__ import annotations

import ast
import json
import re

from bs4 import BeautifulSoup

from ..http import SourceError
from ..models import Application, Attribute, NumberRef, Relationship, SourceMeta, SourceResult
from .base import MIN_FOREIGN_NUMBER, Adapter, LookupRequest, label_has_brand, normalize_brand

BASE_URL = "https://catalogo.facet.eu/EN"
MAX_PAGES = 10
MAX_PRODUCTS = 6
AUTO_MAKES = (
    "Abarth", "Acura", "Alfa Romeo", "Alpina", "Alpine", "Aston Martin", "Audi", "Austin", "Bentley",
    "BMW", "Buick", "BYD", "Cadillac", "Changan", "Chery", "Chevrolet", "Chrysler", "Citroen", "Cupra",
    "Dacia", "Daewoo", "Daihatsu", "Dodge", "DS", "FAW", "Ferrari", "Fiat", "Ford", "GAZ", "Geely",
    "Genesis", "GM", "Great Wall", "Haval", "Honda", "Hyundai", "Infiniti", "Isuzu", "Iveco", "JAC",
    "Jaguar", "Jeep", "Kia", "Lada", "Lancia", "Land Rover", "LDV", "Lexus", "Lincoln", "Lotus",
    "MAN", "Maserati", "Mazda", "Mercedes-Benz", "MG", "Mini", "Mitsubishi", "Nissan", "Opel",
    "Peugeot", "Pontiac", "Porsche", "Proton", "Renault", "Rover", "Saab", "Scania", "Seat", "Skoda",
    "Smart", "Ssangyong", "Subaru", "Suzuki", "Tesla", "Toyota", "UAZ", "Vauxhall", "Volkswagen", "Volvo",
    # Additional exact labels in this catalogue's public vehicle-maker tree.
    "Astra", "Austin-Healey", "Autobianchi", "BMW Motorcycles", "Bond", "Borgward", "Citroën",
    "DAF", "Daimler", "DR", "ERF", "EVO", "Ford Australia", "Ford USA", "FSO", "Fuso", "Ginetta",
    "Holden", "Innocenti", "Irisbus", "Jensen", "KG Mobility", "Lamborghini", "Maruti", "Maybach",
    "MAZ-MAN", "Morris", "Moto Guzzi", "Neoplan", "New Holland", "NSU", "Piaggio", "Polestar",
    "Puch", "Ram", "Reliant", "Renault Trucks", "Riley", "Rolls-Royce", "Setra", "Solaris", "Talbot",
    "Temsa", "Triumph", "TVR", "Wolseley", "Yugo", "Zastava",
)


def compact(number):
    return re.sub(r"[^A-Za-z0-9]", "", number or "").upper()


def literal_object(text):
    """Decode the source's JSON-shaped literal; never execute JavaScript.

    ast.literal_eval is used only for single quoted string tokens, not the
    object, code or packed binary keys. JSON validates the resulting object.
    """
    if len(text) > 1_000_000:
        raise SourceError("FACET callback state is unexpectedly large")
    try:
        tokens = r'''"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*' '''.strip()
        converted = re.sub(tokens, lambda m: json.dumps(ast.literal_eval(m.group(0))) if m.group(0).startswith("'") else m.group(0), text)
        result = json.loads(converted)
    except (ValueError, SyntaxError) as error:
        raise SourceError("FACET callback literal is invalid") from error
    if not isinstance(result, dict):
        raise SourceError("FACET callback state is not an object")
    return result


def callback_metadata(prefix):
    match = re.fullmatch(r"\s*/\*DX\*/\((.*)\)\s*", prefix, re.S)
    if not match:
        raise SourceError("FACET callback metadata is missing")
    result = literal_object(match.group(1)).get("result")
    if not isinstance(result, dict):
        raise SourceError("FACET callback returned an invalid result")
    return result


def callback_reply(body):
    prefix, marker, html = body.partition("/*DXHTML*/")
    if not marker:
        raise SourceError("FACET catalogue callback HTML is missing")
    result = callback_metadata(prefix)
    if not isinstance(result.get("stateObject"), dict):
        raise SourceError("FACET callback returned an invalid state")
    return result["stateObject"], html


def initial_controls(html, expected_title="FACET Catalog"):
    soup = BeautifulSoup(html, "html.parser")
    title = soup.title.get_text(" ", strip=True) if soup.title else ""
    if normalize_brand(title) != normalize_brand(expected_title):
        raise SourceError("FACET catalogue brand identity is missing")
    controls = {}
    for script in soup.select("script:not([src])"):
        text = script.get_text()
        name = re.search(r"new MVCxClient(?:GridView|DataView)\('([^']+)'\)", text)
        state = re.search(r"dxo.stateObject\s*=\s*\((\{.*?\})\)\s*;", text, re.S)
        if name and state:
            controls[name.group(1)] = literal_object(state.group(1))
    return controls


def grid_argument(values, state):
    # Exact serializer and KV/GB framing used by the source's public SDK.
    args = "".join(f"{len(str(value))}|{value}" for value in values)
    keys = json.dumps(state.get("keys", []), ensure_ascii=False, separators=(",", ":"))
    return f"c0:KV|{len(keys)};{keys};GB|{len(args)};{args};"


def search_codes(html):
    soup = BeautifulSoup(html, "html.parser")
    seen = set()
    for link in soup.select('a[onclick*="CallDetailCommerce"]'):
        match = re.fullmatch(r'\s*CallDetailCommerce\("([^"<>]+)"\);?\s*', str(link["onclick"]))
        if match and match.group(1) not in seen:
            seen.add(match.group(1))
            yield match.group(1)


def grouped_rows(html, control):
    soup = BeautifulSoup(html, "html.parser")
    maker = None
    for row in soup.select("tr[id]"):
        identity = str(row["id"])
        if not identity.startswith(control + "_DX"):
            continue
        if "GroupRow" in identity:
            label = row.select_one("td[colspan]")
            maker = label.get_text(" ", strip=True) if label else None
        elif "DataRow" in identity and maker:
            cells = row.find_all("td", recursive=False)
            yield maker, cells[1:]


def validate_columns(html, control, expected):
    soup = BeautifulSoup(html, "html.parser")
    row = soup.find("tr", id=control + "_DXHeadersRow0")
    if row is None:
        raise SourceError(f"FACET {control} table headers are missing")
    labels = [c.get_text(" ", strip=True) for c in row.find_all("td", recursive=False)][1:]
    if labels != list(expected):
        raise SourceError(f"FACET {control} table columns have changed")


def parse_references(html, record_url):
    validate_columns(html, "GVcrossReferenceBig", ("CROSS REFERENCE", "Note", "Replaced by"))
    found, seen = [], set()
    for maker, cells in grouped_rows(html, "GVcrossReferenceBig"):
        if len(cells) != 3:
            raise SourceError("FACET reference row columns have changed")
        number = cells[0].get_text("", strip=False).strip()
        if not number or (maker, number) in seen:
            continue
        seen.add((maker, number))
        note = cells[1].get_text(" ", strip=True)
        tips = [str(n.get("title") or "") for n in cells[1].select("[title]") if n.get("title")]
        replacement = cells[2].get_text("", strip=False).strip()
        raw = "CROSS REFERENCE | " + maker + " | " + number
        if note or tips:
            raw += " | Note: " + " ".join([note, *tips]).strip()
        if replacement:
            raw += " | Replaced by: " + replacement
        # The row explicitly names the maker. Only the type distinction
        # uses established vehicle-maker identities, never fitment to infer
        # a number or change its stated maker.
        oe = any(label_has_brand(maker, name) for name in AUTO_MAKES)
        found.append(Relationship(to=NumberRef(maker, "oem" if oe else "aftermarket", number),
                                  relation_type="OEM_REFERENCE" if oe else "COMPETITOR_REFERENCE",
                                  raw_relation_text=raw[:2000], record_url=record_url))
    return found


def parse_applications(html, record_url):
    validate_columns(html, "GVguidaApplicazioniBig", ("Vehicle - Type of Engine", "Engine Code", "Production year", "Function on the vehicle"))
    found = []
    for maker, cells in grouped_rows(html, "GVguidaApplicazioniBig"):
        if len(cells) != 4:
            raise SourceError("FACET application row columns have changed")
        model, engine, dates, function = [c.get_text(" ", strip=True) for c in cells]
        date = re.fullmatch(r"(?:(\d{2})/(\d{4}))?\s*-\s*(?:(\d{2})/(\d{4}))?", dates)
        found.append(Application(
            make=maker, model=model or None, engine_code=engine or None,
            year_from=int(date.group(2)) if date and date.group(2) else None,
            year_to=int(date.group(4)) if date and date.group(4) else None,
            constraints={"function_on_vehicle": function} if function else None,
            raw_text=" | ".join((maker, model, engine, dates, function))[:2000], record_url=record_url,
        ))
    return found


class FacetAdapter(Adapter):
    version = "1.1.0"
    min_interval = 5.0
    cross_search = True
    base_url = BASE_URL
    catalog_title = "FACET Catalog"

    @property
    def source(self):
        return SourceMeta(key="facet", name="FACET (каталог виробника)", kind="manufacturer_catalog",
                          license_class="OPEN", lineage="FACET", url=BASE_URL)

    @property
    def brands(self):
        return ("FACET",)

    def _bootstrap(self):
        return initial_controls(self.http.fetch(self.base_url), self.catalog_title)

    def _metadata(self, number):
        data = self.http.fetch_json(self.base_url + "/Home/DettaglioFinale", method="POST", form_body={"codfacetFinale": number})
        if not isinstance(data, dict) or not isinstance(data.get("Success"), bool):
            raise SourceError("FACET product metadata is missing")
        code = str(data.get("Cod") or "").strip()
        if data["Success"] and (not isinstance(data.get("Cod"), str) or not code):
            raise SourceError("FACET product metadata has no own code")
        return data if data["Success"] is True and compact(code) == compact(number) else None

    def _callback_form(self, control, number, state, command=None, grid=True, extra=None):
        argument = grid_argument(command or ["CUSTOMCALLBACK", "[object Object]"], state) if grid else (command or "c0:c[object Object]")
        form = {"DXCallbackName": control, "DXCallbackArgument": argument,
                control: json.dumps(state, ensure_ascii=False, separators=(",", ":")), "SessionName": number, "parameter": number,
                "TypeName": "Big", "SessionNameAlt": "", "Ordinamento": "", "TipoOrdinamento": ""}
        if command is not None:
            form.pop("parameter")
        form.update(extra or {})
        return form

    def _callback(self, control, route, number, state, command=None, grid=True, extra=None):
        form = self._callback_form(control, number, state, command, grid, extra)
        return callback_reply(self.http.fetch(self.base_url + "/Home/" + route, method="POST", form_body=form))

    def _page_values(self, control, route, number, state, fields, extra=None):
        form = self._callback_form(control, number, state, ["PAGEROWVALUES", fields], extra=extra)
        form["DXCallbackArgument"] = "c0:FB|1;0;" + form["DXCallbackArgument"][3:]
        body = self.http.fetch(self.base_url + "/Home/" + route, method="POST", form_body=form)
        data = callback_metadata(body).get("html")
        if not isinstance(data, str) or not data.startswith("FB|0|"):
            raise SourceError("FACET row-value callback is missing")
        value = literal_object("{'value':" + data[5:] + "}")["value"]
        if not isinstance(value, list):
            raise SourceError("FACET row-value callback is not a list")
        return value

    def _grid_pages(self, controls, control, route, number, expand=False, max_pages=MAX_PAGES, extra=None, with_state=False, notices=None):
        if control not in controls:
            raise SourceError(f"FACET catalogue control {control} is missing")
        state, html = self._callback(control, route, number, controls[control], extra=extra)
        if expand:
            state, html = self._callback(control, route, number, state, ["EXPANDALL"], extra=extra)
        page = 0
        while True:
            yield (state, html) if with_state else html
            match = re.search(r"\bdxo.pageCount=(\d+);", html)
            pages = int(match.group(1)) if match else 1
            if page + 1 >= pages or (max_pages is not None and page + 1 >= max_pages):
                if page + 1 < pages and notices is not None:
                    notices.append(Attribute(name=control + " paging limit", value=f"read {page + 1} of {pages} pages"))
                return
            page += 1
            previous = html
            state, html = self._callback(control, route, number, state, ["GOTOPAGE", page], extra=extra)
            if html == previous:
                raise SourceError("FACET grid paging did not advance")

    def _view_pages(self, controls, control, route, number, max_pages=MAX_PAGES, notices=None):
        if control not in controls:
            raise SourceError(f"FACET catalogue control {control} is missing")
        state, html = self._callback(control, route, number, controls[control], grid=False)
        page = 0
        while True:
            yield html
            pages = state.get("pageCount")
            size = state.get("pageSize")
            if not isinstance(pages, int) or not isinstance(size, int) or size < 1:
                raise SourceError("FACET catalogue paging state is missing")
            if page + 1 >= pages or (max_pages is not None and page + 1 >= max_pages):
                if page + 1 < pages and notices is not None:
                    notices.append(Attribute(name=control + " paging limit", value=f"read {page + 1} of {pages} pages"))
                return
            # GotoPage in the source's SDK uses CallbackSeparator ':'.
            argument = f"c0:p{page}:{size}:PN{page + 1}"
            page += 1
            state, html = self._callback(control, route, number, state, argument, grid=False)
            if state.get("pageIndex") != page:
                raise SourceError("FACET catalogue paging did not advance")

    def lookup(self, request):
        if not request.number.strip() or not self.supports(request):
            return SourceResult()
        controls = self._bootstrap()
        data = self._metadata(request.number.strip())
        if not data:
            return SourceResult()
        code = data["Cod"].strip()
        record_url = self.base_url + "/Home/DettaglioFinale"
        result = SourceResult()
        for key in ("Cod", "Descrizione_EN", "Stato", "Confezione", "Impianto", "SuperKit"):
            if isinstance(data.get(key), str) and data[key].strip():
                result.attributes.append(Attribute(name=key, value=data[key].strip(), raw_text=f"{key}: {data[key]}"))
        for html in self._grid_pages(controls, "GVcrossReferenceBig", "DettaglioCrossReference?tipo=Big", code, notices=result.attributes):
            result.relationships.extend(parse_references(html, record_url))
        for html in self._grid_pages(controls, "GVguidaApplicazioniBig", "DettaglioGuidaApplicazioni?tipo=Big", code, expand=True, notices=result.attributes):
            result.applications.extend(parse_applications(html, record_url))
        for record in (*result.relationships, *result.applications):
            record.record_ref = f"{self.brands[0]} {code}"
        for values, limit, name in ((result.relationships, 450, "References"), (result.applications, 5000, "Applications")):
            if len(values) > limit:
                total = len(values)
                del values[limit:]
                result.attributes.append(Attribute(name=f"{name} count", value=f"showing {limit} of {total}"))
        return result

    def lookup_foreign(self, request):
        wanted = compact(request.number)
        result = SourceResult()
        if len(wanted) < MIN_FOREIGN_NUMBER:
            return result
        controls = self._bootstrap()
        seen = set()
        for control, route in (("GVArticoliOE2", "ArticoliFacetGriglia2"), ("GVArticoliCR2", "ArticoliFacetGriglia3")):
            if control not in controls:
                raise SourceError(f"FACET catalogue control {control} is missing")
            for html in self._view_pages(controls, control, route, request.number.strip(), notices=result.attributes):
                for code in search_codes(html):
                    if code in seen:
                        continue
                    if len(seen) >= MAX_PRODUCTS:
                        result.attributes.append(Attribute(name="Foreign search limit", value=f"checked {MAX_PRODUCTS} products"))
                        return result
                    seen.add(code)
                    data = self._metadata(code)
                    if not data:
                        continue
                    for refs in self._grid_pages(controls, "GVcrossReferenceBig", "DettaglioCrossReference?tipo=Big", code, notices=result.attributes):
                        match = next((r for r in parse_references(refs, self.base_url + "/Home/DettaglioFinale")
                                      if compact(r.to.number) == wanted and label_has_brand(r.to.brand, request.brand)), None)
                        if match:
                            result.relationships.append(Relationship(to=NumberRef(self.brands[0], "aftermarket", data["Cod"].strip()),
                                                        relation_type=match.relation_type, direction="incoming",
                                                        raw_relation_text=match.raw_relation_text, record_ref=f"{self.brands[0]} {data['Cod'].strip()}", record_url=match.record_url))
                            break
        return result
