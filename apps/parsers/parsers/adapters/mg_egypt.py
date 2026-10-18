"""MG Egypt's public genuine-parts list: own codes and model/year fitment.

The native read-only product action has cumulative filter pages. Request
the final cumulative page computed from the source's own count, and verify
all unique product IDs before using any rows. The static first page is not
a complete snapshot. Merchandise with no part number or fitment is omitted.
No prefix removal, cross references, price/stock or inferred variants.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import urlsplit

from bs4 import BeautifulSoup

from ..http import SourceError
from ..models import Application, Attribute, Image, SourceMeta, SourceResult
from .base import Adapter, LookupRequest

CATALOG_URL = "https://www.mgmotor.com.eg/spareparts-catalog/"
AJAX_URL = "https://www.mgmotor.com.eg/wp-admin/admin-ajax.php"
MAX_RECORDS = 5000
MAX_PRODUCT_IMAGES = 4


def compact(number):
    return re.sub(r"[^A-Za-z0-9]", "", number or "").upper()


@dataclass(frozen=True)
class PartRow:
    product_id: str
    number: str
    title: str
    model: str
    year: int | None
    category: str
    fitment_text: str
    image_url: str | None = None


def _product_image_url(card, number: str) -> str | None:
    candidates = []
    image = card.select_one(".img img")
    if image:
        candidates.extend((image.get("data-lazy-src"), image.get("src")))
    candidates.extend(node.get("src") for node in card.select(".img noscript img[src]"))
    for candidate in candidates:
        if not isinstance(candidate, str):
            continue
        try:
            url = urlsplit(candidate.strip())
            port = url.port
        except ValueError:
            continue
        filename = url.path.rsplit("/", 1)[-1]
        if (
            url.scheme == "https"
            and url.hostname in {"www.mgmotor.com.eg", "mgmotor.com.eg"}
            and port is None
            and not url.username
            and not url.password
            and url.path.startswith("/wp-content/uploads/")
            and not url.query
            and not url.fragment
            and ".." not in url.path.split("/")
            and re.fullmatch(r"[A-Za-z0-9._-]+\.jpe?g", filename, re.IGNORECASE)
            and re.match(re.escape(number) + r"[-_]", filename, re.IGNORECASE)
            and not re.search(r"placeholder|no[-_]?image|default", filename, re.IGNORECASE)
        ):
            return candidate.strip()
    return None


def bootstrap(html):
    soup = BeautifulSoup(html, "html.parser")
    title = soup.title.get_text(" ", strip=True) if soup.title else ""
    root = soup.select_one("ul.products_list.products[data-count]")
    if "Spareparts Catalog" not in title or "MG Motors in Egypt" not in title or root is None:
        raise SourceError("MG Egypt catalogue identity or product-list metadata is missing")
    if soup.body is None or soup.body.get("data-mitch-ajax-url") != AJAX_URL:
        raise SourceError("MG Egypt public product action has changed")
    try:
        count = int(str(root["data-count"]))
    except (TypeError, ValueError) as error:
        raise SourceError("MG Egypt page size is invalid") from error
    if not 1 <= count <= 100:
        raise SourceError("MG Egypt page size is unexpectedly large")
    return {"count": str(count), "page": "1", "order": str(root.get("data-sort") or ""),
            "model": str(root.get("data-model") or ""), "year": str(root.get("data-year") or ""),
            "cat": str(root.get("data-cat") or "")}


def parse_rows(html, expected_count):
    soup = BeautifulSoup(html, "html.parser")
    cards = soup.select("li.product_widget[id]")
    identities = [str(c["id"]) for c in cards]
    if len(cards) != expected_count or len(set(identities)) != expected_count:
        raise SourceError("MG Egypt catalogue is incomplete or contains duplicate product IDs")
    rows = []
    for card in cards:
        identity = re.fullmatch(r"product_(\d+)_block", str(card["id"]))
        number_node = card.select_one(".foot-text > span")
        fitment_node = card.select_one(".info-text > span")
        title_node = card.select_one("h3.title")
        if not identity or number_node is None or title_node is None:
            raise SourceError("MG Egypt product-card structure has changed")
        number_text = number_node.get_text("", strip=False).strip()
        number_match = re.fullmatch(r"Part No\.\s*(.*)", number_text, re.S)
        if not number_match:
            raise SourceError("MG Egypt part-number label has changed")
        number = number_match.group(1).strip()
        fitment = fitment_node.get_text(" ", strip=True) if fitment_node else ""
        if not number and not fitment:
            continue  # boutique merchandise is not a catalogue part
        title = title_node.get_text(" ", strip=True)
        if not number or not fitment or not title:
            raise SourceError("MG Egypt numbered part has incomplete identity or fitment")
        vehicle, slash, category = fitment.rpartition("/")
        model, separator, year_text = vehicle.rpartition(" - ")
        if not separator:
            model, year_text = vehicle.strip(), ""
        year_text = year_text.strip()
        if not slash or not category.strip() or not re.fullmatch(r"MG\s+.+", model):
            raise SourceError("MG Egypt model/year/category label has changed")
        if year_text and not re.fullmatch(r"\d{4}", year_text):
            raise SourceError("MG Egypt model year is invalid")
        year = int(year_text) if year_text else None
        if year is not None and not 1900 <= year <= 2100:
            raise SourceError("MG Egypt model year is invalid")
        rows.append(PartRow(identity.group(1), number, title, model.strip(), year,
                            category.strip(), fitment, _product_image_url(card, number)))
    return rows


class MgEgyptAdapter(Adapter):
    version = "1.1.0"
    min_interval = 5.0

    @property
    def source(self):
        return SourceMeta(key="mg-egypt", name="MG Egypt (каталог виробника)", kind="manufacturer_catalog",
                          license_class="OPEN", lineage="MG", url=CATALOG_URL,
                          license_note="Official regional genuine-parts list; own printed codes, model/model-year fitment only. No crosses or inferred engine/market variants.")

    @property
    def brands(self):
        return ("MG",)

    def rows(self):
        form = bootstrap(self.http.fetch(CATALOG_URL))
        total = self.http.fetch_json(AJAX_URL, method="POST", form_body={"action": "get_products_ajax_count", **form})
        if isinstance(total, bool) or not isinstance(total, int) or total < 0 or total > MAX_RECORDS:
            raise SourceError("MG Egypt catalogue count is invalid or exceeds the safe read limit")
        if total == 0:
            return []
        # Native 'filter' returns count * page cards cumulatively; unlike
        # loadmore's slices it avoids stale static HTML and unstable ties
        # in catalogue ordering. The count must match the complete result.
        page = (total + int(form["count"]) - 1) // int(form["count"])
        body = self.http.fetch(AJAX_URL, method="POST", form_body={"action": "get_products_ajax", **form,
                               "page": str(page), "fn_action": "filter"})
        return parse_rows(body, total)

    def lookup(self, request):
        wanted = compact(request.number)
        result = SourceResult()
        if not wanted or not self.supports(request):
            return result
        seen_apps, seen_attrs = set(), set()
        seen_images: set[str] = set()
        for row in self.rows():
            if compact(row.number) != wanted:
                continue
            raw = f"{row.fitment_text} | {row.title} | Part No. {row.number}"
            ref = f"product {row.product_id}; part {row.number}"
            app_key = (row.model, row.year)
            if app_key not in seen_apps:
                seen_apps.add(app_key)
                result.applications.append(Application(make="MG", model=row.model, year_from=row.year, year_to=row.year,
                                                       raw_text=raw, record_ref=ref, record_url=CATALOG_URL))
            for name, value in (("Part Number", row.number), ("Description", row.title), ("Category", row.category)):
                if (name, value) not in seen_attrs:
                    seen_attrs.add((name, value))
                    result.attributes.append(Attribute(name=name, value=value, raw_text=raw))
            if row.image_url and row.image_url not in seen_images and len(seen_images) < MAX_PRODUCT_IMAGES:
                seen_images.add(row.image_url)
                result.images.append(Image(url=row.image_url, kind="photo", record_url=CATALOG_URL))
        return result
