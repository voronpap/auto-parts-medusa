"""bilstein group partsfinder: febi, SWAG and Blue Print.

Reads the JSON API the public catalog page itself calls. The API serves an
anonymous visitor session, which the page obtains from /vue/init; no account
is involved. The catalog does not publish which vehicles an article fits
without registration, so this source yields OE references, the same article
under the group's other brands, and technical attributes, but no fitment.
"""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import quote

from ..http import SourceBlocked
from ..models import Attribute, NumberRef, Relationship, SourceMeta, SourceResult
from .base import MIN_FOREIGN_NUMBER, Adapter, LookupRequest, label_has_brand, normalize_brand

BASE_URL = "https://partsfinder.bilsteingroup.com"
API_URL = f"{BASE_URL}/api/articles"
INIT_URL = f"{BASE_URL}/vue/init"

# Catalog brand codes by normalized brand name.
BRAND_CODES = {
    "febi": "FEBI",
    "febibilstein": "FEBI",
    "swag": "SWAG",
    "blueprint": "BLUE_PRINT",
}
BRAND_NAMES = {"FEBI": "febi", "SWAG": "SWAG", "BLUE_PRINT": "Blue Print"}
VEHICLE_TYPES = ("CAR", "TRUCK")
# No Accept header: the API answers 406 to "application/json" and serves its
# JSON:API media type to the default "*/*".
HEADERS = {"Accept-Language": "uk"}


def _compact(number: str) -> str:
    """Comparison key only; numbers are always reported as the source writes them."""
    return re.sub(r"[^0-9A-Za-z]", "", number).upper()


def _make_name(make: str) -> str:
    """ "Volkswagen (VW)" -> "Volkswagen": the bracket is the catalog's own alias."""
    return re.sub(r"\s*\([^)]*\)\s*$", "", make).strip()


class BilsteinGroupAdapter(Adapter):
    version = "1.1.0"
    # The site's robots.txt asks for five seconds between requests.
    min_interval = 5.0
    cross_search = True

    def __init__(self, http) -> None:
        super().__init__(http)
        self._has_session = False

    @property
    def source(self) -> SourceMeta:
        return SourceMeta(
            key="bilstein-group",
            name="bilstein group: febi / SWAG / Blue Print (каталог виробника)",
            kind="manufacturer_catalog",
            license_class="OPEN",
            lineage="febi",
            url=f"{BASE_URL}/uk",
        )

    @property
    def brands(self) -> tuple[str, ...]:
        return ("febi", "febi bilstein", "SWAG", "Blue Print")

    def _get(self, url: str, params: dict[str, Any]) -> Any:
        """Calls the API, opening an anonymous visitor session when needed."""
        if not self._has_session:
            self.http.fetch(INIT_URL, use_cache=False)
            self._has_session = True

        try:
            return self.http.fetch_json(url, params=params, headers=HEADERS)
        except SourceBlocked:
            # The session expired: open a new one and try exactly once more.
            self.http.fetch(INIT_URL, use_cache=False)
            return self.http.fetch_json(url, params=params, headers=HEADERS)

    def _search(self, phrase: str, vehicle_type: str) -> Any:
        return self._get(
            API_URL,
            {
                "filter[phrase]": phrase,
                "filter[country]": "UA",
                # All brands, as the page asks: filtering to one brand
                # hides the article's links to its sister-brand twins.
                "filter[brands]": ",".join(BRAND_NAMES),
                "filter[vehicleType]": vehicle_type,
                "page[number]": 0,
                "page[size]": 24,
                "sort": "rel",
            },
        )

    def lookup_foreign(self, request: LookupRequest) -> SourceResult:
        """The group's articles that list the maker's number among their OE numbers."""
        wanted = _compact(request.number)
        result = SourceResult()
        seen: set[tuple[str, str]] = set()

        if len(wanted) < MIN_FOREIGN_NUMBER:
            return result

        for vehicle_type in VEHICLE_TYPES:
            for article in self._search(request.number, vehicle_type).get("data") or []:
                attributes = article.get("attributes") or {}
                brand = BRAND_NAMES.get(attributes.get("bgBrand"))
                article_id = str(article.get("id") or "").strip()

                if not brand or not article_id or (brand, article_id) in seen:
                    continue

                # The search is by phrase: the article counts only if it
                # states this number under this maker.
                stated = next(
                    (
                        (str(group.get("make")), str(number))
                        for group in attributes.get("oeNumbers") or []
                        if label_has_brand(str(group.get("make") or ""), request.brand)
                        for number in group.get("numbers") or []
                        if _compact(str(number)) == wanted
                    ),
                    None,
                )

                if stated is None:
                    continue

                seen.add((brand, article_id))
                result.relationships.append(
                    Relationship(
                        to=NumberRef(brand, "aftermarket", article_id),
                        relation_type="OEM_REFERENCE",
                        # The group's article carries the reference to the asked number.
                        direction="incoming",
                        raw_relation_text=f"OE number: {stated[0]} {stated[1]}",
                        record_ref=f"article {article_id}",
                        record_url=f"{BASE_URL}/uk/search?q={quote(article_id)}",
                    )
                )

        return result

    def _find(self, request: LookupRequest, brand_code: str) -> tuple[dict, str] | None:
        wanted = _compact(request.number)

        for vehicle_type in VEHICLE_TYPES:
            found = self._search(request.number, vehicle_type)

            for article in found.get("data") or []:
                attributes = article.get("attributes") or {}

                # The search is by phrase, so it also returns articles that
                # merely mention the number. Only the article itself counts.
                if (
                    attributes.get("bgBrand") == brand_code
                    and _compact(str(article.get("id", ""))) == wanted
                ):
                    return article, vehicle_type

        return None

    def lookup(self, request: LookupRequest) -> SourceResult:
        brand_code = BRAND_CODES.get(normalize_brand(request.brand))

        if not brand_code or not _compact(request.number):
            return SourceResult()

        match = self._find(request, brand_code)

        if match is None:
            return SourceResult()

        article, vehicle_type = match
        article_id = str(article["id"])
        attributes = article.get("attributes") or {}
        record_ref = f"article {article_id}"
        record_url = f"{BASE_URL}/uk/search?q={quote(article_id)}"
        result = SourceResult()

        for group in attributes.get("oeNumbers") or []:
            make = _make_name(str(group.get("make") or ""))

            for number in group.get("numbers") or []:
                if make and str(number).strip():
                    result.relationships.append(
                        Relationship(
                            to=NumberRef(make, "oem", str(number)),
                            relation_type="OEM_REFERENCE",
                            raw_relation_text="OE number",
                            record_ref=record_ref,
                            record_url=record_url,
                        )
                    )

        related = (article.get("relationships") or {}).get("articles") or {}

        if related.get("data"):
            detail = self._get(
                f"{API_URL}/{quote(article_id, safe='')}",
                {
                    "filter[vehicleType]": vehicle_type,
                    "filter[country]": "UA",
                    "filter[brands]": ",".join(BRAND_NAMES),
                },
            )
            master_id = attributes.get("masterId")

            for other in detail.get("included") or []:
                other_attributes = other.get("attributes") or {}
                brand = BRAND_NAMES.get(other_attributes.get("bgBrand"))

                if other.get("type") != "articles" or not brand:
                    continue

                # One master article sold under several of the group's brands
                # is the same part. Anything else is only a listed relation.
                same_master = master_id is not None and (
                    other_attributes.get("masterId") == master_id
                )
                result.relationships.append(
                    Relationship(
                        to=NumberRef(brand, "aftermarket", str(other["id"])),
                        relation_type=(
                            "MANUFACTURER_INTERCHANGE"
                            if same_master
                            else "AFTERMARKET_CROSS"
                        ),
                        raw_relation_text=(
                            f"same bilstein group master article {master_id}"
                            if same_master
                            else "related article"
                        ),
                        ambiguous=not same_master,
                        record_ref=record_ref,
                        record_url=record_url,
                    )
                )

        description = " ".join(
            part
            for part in (
                attributes.get("articleDescription"),
                attributes.get("additionalDescription"),
            )
            if part
        )

        if description:
            result.attributes.append(Attribute(name="Назва", value=description))

        if attributes.get("fittingSide"):
            result.attributes.append(
                Attribute(name="Місце встановлення", value=attributes["fittingSide"])
            )

        for item in attributes.get("articleAttributes") or []:
            if item.get("type") and item.get("value"):
                result.attributes.append(
                    Attribute(
                        name=str(item["type"]),
                        value=str(item["value"]),
                        unit=item.get("unit"),
                    )
                )

        return result
