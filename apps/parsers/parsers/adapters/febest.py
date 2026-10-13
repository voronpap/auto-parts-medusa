"""Febest catalogue (febest.de): chassis, drivetrain and sensor parts.

The catalogue is rendered by the server and can be searched by its own code,
by an OE number and by vehicle. A product page lists the OE numbers the part
answers to and the vehicles it fits.

The catalogue gives OE numbers without naming the maker. The maker is taken
from the vehicles the part fits: when they are all of one make the number is
that make's; when they are of several, the number is recorded under each and
marked ambiguous for review rather than assigned by guesswork.

A number marked "#" is the OE number of an assembled unit: the maker sells
only the assembly, and the Febest part is a component of it. That is recorded
as "the assembly contains this part", not as an equivalent.
"""

from __future__ import annotations

import re
from urllib.parse import quote

from bs4 import BeautifulSoup

from ..models import Application, Attribute, NumberRef, Relationship, SourceMeta, SourceResult
from .base import MIN_FOREIGN_NUMBER, Adapter, LookupRequest, label_has_brand

BASE_URL = "https://febest.de"
CATALOG_URL = f"{BASE_URL}/en/catalog"

# Makes written in two words; every other make is the first word of a line.
TWO_WORD_MAKES = (
    "GREAT WALL", "LAND ROVER", "MERCEDES BENZ", "ALFA ROMEO", "SSANG YONG",
    "GENERAL MOTORS", "ROLLS ROYCE", "ASTON MARTIN",
)
# "NISSAN X-TRAIL T31 2007.05-2014.04 [ER]", "CHERY TIGGO T11 2006-2013".
VEHICLE_RE = re.compile(
    r"^(?P<vehicle>.+?)\s+(?P<from>\d{4})(?:\.\d{2})?\s*-\s*(?:(?P<to>\d{4})(?:\.\d{2})?)?\s*(?:\[(?P<market>[^\]]+)\])?$"
)
# The catalog accepts at most this many crosses and fitment rows in one result.
MAX_RELATIONSHIPS = 450
MAX_APPLICATIONS = 5000
# A search by OE number is confirmed product by product, each costing a request.
MAX_FOREIGN_PRODUCTS = 5


def _compact(number: str) -> str:
    """Comparison key only; numbers are always reported as the source writes them."""
    return re.sub(r"[^0-9A-Za-z]", "", number).upper()


def split_vehicle(text: str) -> tuple[str, str]:
    """Make and model of "GREAT WALL HOVER H5 ...": the make may be two words."""
    upper = text.upper()

    for make in TWO_WORD_MAKES:
        if upper.startswith(make + " ") or upper == make:
            return make, text[len(make):].strip()

    make, _, model = text.partition(" ")

    return make, model.strip()


def parse_list(html: str) -> list[tuple[str, str]]:
    """(code, product page address) of every row of a catalogue list page."""
    soup = BeautifulSoup(html, "html.parser")
    found: list[tuple[str, str]] = []
    seen: set[str] = set()

    for link in soup.select('td[title] > a[href*="/details/"]'):
        code = (link.parent.get("title") or "").strip()
        href = link.get("href") or ""

        # A row repeats the link in every cell; the first cell holds the code.
        if code and href not in seen:
            seen.add(href)
            found.append((code, href if href.startswith("http") else f"{BASE_URL}{href}"))

    return found


def parse_product_page(html: str, record_url: str) -> tuple[str | None, SourceResult, list[tuple[str, bool]]]:
    """Code of the product, what the page states, and its OE numbers.

    The OE numbers are returned as (number, is_assembly) besides being turned
    into relationships, for callers that match a number themselves.
    """
    soup = BeautifulSoup(html, "html.parser")
    code_node = soup.select_one(".detPartCode")
    code = re.sub(r"^\s*Code:\s*", "", code_node.get_text(" ", strip=True)) if code_node else None
    name_node = soup.select_one(".detPartHead")
    result = SourceResult()

    if name_node and name_node.get_text(strip=True):
        result.attributes.append(Attribute(name="Назва", value=name_node.get_text(" ", strip=True)))

    makes: list[str] = []

    for option in soup.select("#model_list option"):
        text = re.sub(r"\s+", " ", option.get_text(" ", strip=True))

        if not text:
            continue

        match = VEHICLE_RE.match(text)
        make, model = split_vehicle(match.group("vehicle") if match else text)

        if not make:
            continue

        if make not in makes:
            makes.append(make)

        result.applications.append(
            Application(
                make=make,
                model=model or None,
                market=match.group("market") if match else None,
                year_from=int(match.group("from")) if match else None,
                year_to=int(match.group("to")) if match and match.group("to") else None,
                raw_text=text,
                record_ref=f"product {code}",
                record_url=record_url,
            )
        )

    # A universal part (a wheel nut, say) fits more vehicles than a result
    # may carry; the list is cut and the cut is stated.
    if len(result.applications) > MAX_APPLICATIONS:
        result.attributes.append(
            Attribute(
                name="Застосовність у каталозі",
                value=f"показано {MAX_APPLICATIONS} з {len(result.applications)} автомобілів",
            )
        )
        del result.applications[MAX_APPLICATIONS:]

    numbers: list[tuple[str, bool]] = []
    listed = ", ".join(makes)

    for option in soup.select("#oem_select option"):
        raw = option.get_text(" ", strip=True)
        number = raw.strip("#* ").strip()

        if not number or number == "0":
            continue

        assembly = raw.lstrip().startswith("#")
        numbers.append((number, assembly))

        for make in makes:
            if len(result.relationships) >= MAX_RELATIONSHIPS:
                break

            ambiguous = len(makes) > 1
            result.relationships.append(
                Relationship(
                    to=NumberRef(make, "oem", number),
                    relation_type="CONTAINS" if assembly else "OEM_REFERENCE",
                    # The assembly contains this part, so the relation runs from it.
                    direction="incoming" if assembly else None,
                    raw_relation_text=(
                        f"assembled unit OE number: {raw}" if assembly else f"OEM, cross-reference: {raw}"
                    ),
                    ambiguous=ambiguous,
                    reason=(
                        f"The catalogue gives this number without a maker; the part fits {listed}."
                        if ambiguous
                        else None
                    ),
                    record_ref=f"product {code}",
                    record_url=record_url,
                )
            )

    return code, result, numbers


class FebestAdapter(Adapter):
    version = "1.0.1"
    min_interval = 5.0
    cross_search = True

    @property
    def source(self) -> SourceMeta:
        return SourceMeta(
            key="febest",
            name="FEBEST (каталог виробника)",
            kind="manufacturer_catalog",
            license_class="OPEN",
            lineage="febest",
            url=CATALOG_URL,
        )

    @property
    def brands(self) -> tuple[str, ...]:
        return ("FEBEST", "Febest")

    def _search(self, field: str, value: str) -> list[tuple[str, str]]:
        return parse_list(self.http.fetch(f"{CATALOG_URL}?{field}={quote(value)}"))

    def lookup(self, request: LookupRequest) -> SourceResult:
        wanted = _compact(request.number)

        if not wanted:
            return SourceResult()

        # The search also returns codes that merely start the same way.
        match = next(
            (url for code, url in self._search("code", request.number.strip()) if _compact(code) == wanted),
            None,
        )

        if match is None:
            return SourceResult()

        code, result, _ = parse_product_page(self.http.fetch(match), match)

        return result if code and _compact(code) == wanted else SourceResult()

    def lookup_foreign(self, request: LookupRequest) -> SourceResult:
        """Febest parts whose page lists the OE number for a vehicle of that make."""
        wanted = _compact(request.number)
        result = SourceResult()

        if len(wanted) < MIN_FOREIGN_NUMBER:
            return result

        for _, url in self._search("oem", request.number.strip())[:MAX_FOREIGN_PRODUCTS]:
            code, page, numbers = parse_product_page(self.http.fetch(url), url)
            stated = next((item for item in numbers if _compact(item[0]) == wanted), None)
            makes = {application.make for application in page.applications}

            # The catalogue names no maker for the number: the part must at
            # least fit a vehicle of the maker that was asked about.
            if not code or stated is None or not any(label_has_brand(make, request.brand) for make in makes):
                continue

            number, assembly = stated
            result.relationships.append(
                Relationship(
                    to=NumberRef("FEBEST", "aftermarket", code),
                    relation_type="CONTAINS" if assembly else "OEM_REFERENCE",
                    # An equivalent refers back to the asked number; an
                    # assembly, being the asked number, contains the part.
                    direction=None if assembly else "incoming",
                    raw_relation_text=(
                        f"assembled unit OE number: #{number}" if assembly else f"OEM, cross-reference: {number}"
                    ),
                    record_ref=f"product {code}",
                    record_url=url,
                )
            )

        return result
