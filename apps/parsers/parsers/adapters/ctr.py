"""CTR public regional JSON catalogue, without accounts or security solving.

The top-level oeNo is a technical identifier, not the displayed OE list.
Only oeList and explicitly associated application OE/make pairs are used.
Old/current own codes remain attributes; their coexistence is not a dated
replacement statement. Editorial content, carts and recommendations are ignored.
"""
from __future__ import annotations

import re
from itertools import count
from urllib.parse import quote

from ..http import BLOCKED_STATUSES, SourceBlocked, SourceError
from ..models import Application, Attribute, NumberRef, Relationship, SourceMeta, SourceResult
from .base import MIN_FOREIGN_NUMBER, Adapter, LookupRequest, label_has_brand

API_URL = "https://aftermarket-front-api-exfwgzdybdbmfsfu.koreacentral-01.azurewebsites.net/api/v1/catalogue"
CATALOG_URL = "https://aftermarket.ctr.co.kr/ru/catalogue-search"
SEARCH_URL = f"{API_URL}/search/ru"
DETAIL_URL = f"{API_URL}/search/detail/ru"
MAX_PAGES = 25
MAX_PRODUCTS = 6
PAGE_SIZE = 8


def compact(value):
    return re.sub(r"[^A-Za-z0-9]", "", str(value or "")).upper()


def unwrap(response):
    if isinstance(response, dict) and response.get("statusCode") in BLOCKED_STATUSES:
        raise SourceBlocked("CTR catalogue refuses anonymous access")
    if not isinstance(response, dict) or response.get("statusCode") != 200:
        raise SourceError("CTR catalogue returned an invalid response")
    data = response.get("data")
    if not isinstance(data, dict):
        raise SourceError("CTR catalogue data is missing")
    if isinstance(data.get("cnt"), (int, float)) and data["cnt"] < 0:
        raise SourceBlocked("CTR catalogue security query; no attempt to solve it")
    return data


def search_params(number, page=0, search_type="all"):
    return {"currentPage": page + 1, "startRow": page * PAGE_SIZE, "pageCnt": PAGE_SIZE,
            "searchKeyword": number, "searchType": search_type, "isRefresh": "false",
            "searchCartTp": "", "searchKeywordQty": ""}


def matches_product(hit, detail):
    return bool(hit.get("ctrNo") and detail.get("ctrno")
                and compact(hit["ctrNo"]) == compact(detail["ctrno"])
                and (not hit.get("article") or compact(hit["article"]) == compact(detail.get("article"))))


def _year(value):
    return int(value) if isinstance(value, str) and re.fullmatch(r"\d{4}", value) else None


def parse_detail(data, record_url):
    result = SourceResult()
    record_ref = f"CTR {data.get('ctrno')}; article {data.get('article')}"
    apps = [a for a in data.get("applicationList", []) if isinstance(a, dict) and a.get("make")]
    makes = sorted({a["make"] for a in apps})
    seen = set()
    for row in data.get("oeList", []):
        if not isinstance(row, dict) or not isinstance(row.get("oem"), str) or not row["oem"].strip():
            continue
        number = row["oem"]
        contexts = [a for a in apps if compact(a.get("oeNo")) == compact(number)]
        labelled = {a["make"] for a in contexts}
        # Preserve the source's OE spelling, not its compact application key.
        for make in sorted(labelled or set(makes)):
            if (make, number) in seen:
                continue
            seen.add((make, number))
            ambiguous = not labelled and len(makes) > 1
            raw = f"OE: {number}; source: {row.get('source') or ''}"
            if labelled:
                raw += " | " + " | ".join(f"Application: {a['make']} | {a.get('vehicle') or a.get('model') or ''} | OE: {a.get('oeNo')}" for a in contexts if a["make"] == make)
            result.relationships.append(Relationship(
                to=NumberRef(make, "oem", number), relation_type="OEM_REFERENCE", ambiguous=ambiguous,
                reason=f"OE has no maker; source lists vehicles of {', '.join(makes)}." if ambiguous else None,
                raw_relation_text=raw[:2000], record_ref=record_ref, record_url=record_url,
            ))
        if not makes:
            result.attributes.append(Attribute(name="OE without maker", value=number,
                                               raw_text=f"OE: {number}; source: {row.get('source') or ''}"))
    for app in apps:
        raw = " | ".join(f"{k}: {app[k]}" for k in ("make", "model", "vehicle", "yearFrom", "yearTill", "modelCode", "oeNo") if app.get(k))
        result.applications.append(Application(
            make=app["make"], model=app.get("model") or None,
            year_from=_year(app.get("yearFrom")), year_to=_year(app.get("yearTill")),
            position=data.get("pos") or None,
            constraints={"model_code": app["modelCode"]} if app.get("modelCode") else None,
            raw_text=raw[:2000], record_ref=record_ref, record_url=record_url,
        ))
    # Explicit source field names/values; do not invent units, engine or years.
    labels = {"ctrno": "CTR No", "article": "Article", "etc": "Etc", "product": "Product", "pos": "Position"}
    ordinary = {"material", "suspensionType", "quantityUnit", "mountingType", "suppArticle2", "boltDia", "type", "weight", "note", "note1", "status"}
    prefixes = ("bj", "bush", "re", "te", "ca", "sl", "bp", "bd", "sa", "etc")
    excluded = {"replaces", "replacedBy", "replaceList", "replaceByList", "region", "cautionPoint"}
    for key, value in data.items():
        if key in excluded or not isinstance(value, str) or not value.strip():
            continue
        if key in labels or key in ordinary or key.startswith(prefixes):
            result.attributes.append(Attribute(name=labels.get(key, key), value=value, raw_text=f"{key}: {value}"))
    # These lists have no verified relation mapping yet; do not turn pairs,
    # hybrid links or set membership into interchanges.
    for key in ("partList", "pairList", "replaceList", "replaceByList", "partsHistoryList"):
        if data.get(key):
            result.attributes.append(Attribute(name=f"Source {key}", value="present; relation mapping not verified"))
    for key in ("replaces", "replacedBy", "interchange", "hybridStabilizerLink"):
        if isinstance(data.get(key), str) and data[key]:
            result.attributes.append(Attribute(name=f"Source {key}", value=data[key], raw_text=f"{key}: {data[key]}"))
    return result


class CtrAdapter(Adapter):
    version = "1.0.0"
    min_interval = 5.0
    cross_search = True

    @property
    def source(self):
        return SourceMeta(key="ctr", name="CTR (каталог виробника)", kind="manufacturer_catalog",
                          license_class="OPEN", lineage="CTR", url=CATALOG_URL)

    @property
    def brands(self):
        return ("CTR",)

    def search(self, number, search_type="all", max_pages=MAX_PAGES):
        seen = set()
        for page in count():
            if max_pages is not None and page >= max_pages:
                return
            data = unwrap(self.http.fetch_json(SEARCH_URL, params=search_params(number.strip(), page, search_type)))
            rows = data.get("list")
            if not isinstance(rows, list):
                raise SourceError("CTR search product list is missing")
            fresh = [r for r in rows if isinstance(r, dict) and r.get("ctrNo") and r.get("seq") and str(r["seq"]) not in seen]
            for row in fresh:
                seen.add(str(row["seq"]))
                yield row
            total = data.get("cnt")
            if not isinstance(total, int):
                raise SourceError("CTR search count is missing")
            if not fresh or (page + 1) * PAGE_SIZE >= total:
                return

    def detail(self, hit):
        url = f"{DETAIL_URL}/{quote(str(hit['seq']), safe='')}"
        data = unwrap(self.http.fetch_json(url))
        return (data, url) if matches_product(hit, data) else (None, url)

    def lookup(self, request):
        wanted = compact(request.number)
        if not wanted or not self.supports(request):
            return SourceResult()
        for hit in self.search(request.number):
            if wanted not in {compact(hit.get(key)) for key in ("ctrNo", "article", "etc")}:
                continue
            data, url = self.detail(hit)
            if data and wanted in {compact(data.get(key)) for key in ("ctrno", "article", "etc")}:
                result = parse_detail(data, url)
                for values, limit, name in ((result.relationships, 450, "OE"), (result.applications, 5000, "Applications"), (result.attributes, 295, "Attributes")):
                    if len(values) > limit:
                        total = len(values)
                        del values[limit:]
                        result.attributes.append(Attribute(name=f"{name} count", value=f"showing {limit} of {total}"))
                return result
        return SourceResult()

    def lookup_foreign(self, request):
        wanted = compact(request.number)
        result = SourceResult()
        if len(wanted) < MIN_FOREIGN_NUMBER:
            return result
        for checked, hit in enumerate(self.search(request.number)):
            if checked >= MAX_PRODUCTS:
                break
            data, url = self.detail(hit)
            if not data:
                continue
            # Explicit OE + make in the same source application row, and
            # the same number must also appear in the actual OE list.
            oe = next((r for r in data.get("oeList", []) if isinstance(r, dict) and compact(r.get("oem")) == wanted), None)
            app = next((a for a in data.get("applicationList", []) if isinstance(a, dict) and compact(a.get("oeNo")) == wanted and label_has_brand(a.get("make") or "", request.brand)), None)
            if oe and app:
                result.relationships.append(Relationship(
                    to=NumberRef("CTR", "aftermarket", data["ctrno"]), relation_type="OEM_REFERENCE", direction="incoming",
                    raw_relation_text=(f"OE: {oe['oem']}; source: {oe.get('source') or ''} | Application: {app['make']} | {app.get('vehicle') or ''} | OE: {app.get('oeNo')}")[:2000],
                    record_ref=f"CTR {data['ctrno']}; article {data.get('article')}", record_url=url,
                ))
        return result
