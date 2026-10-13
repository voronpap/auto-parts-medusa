"""The contract every source adapter implements."""

from __future__ import annotations

import re
import unicodedata
from abc import ABC, abstractmethod
from dataclasses import dataclass

from ..http import PoliteSession
from ..models import SourceMeta, SourceResult


def normalize_brand(value: str) -> str:
    """Same folding the catalog uses to match brand names and aliases."""
    folded = unicodedata.normalize("NFKC", value).lower()
    return re.sub(r"[^\w]+", "", folded, flags=re.UNICODE).replace("_", "")


# Names one maker goes by in catalogues (normalized) -> one key for comparing.
BRAND_SYNONYMS = {
    "volkswagen": "vw",
    "vwgroup": "vw",
    "vag": "vw",
    "mercedes": "mercedesbenz",
    "febibilstein": "febi",
    "mannfilter": "mann",
}
# Shorter numbers match too many unrelated products to be asked about.
MIN_FOREIGN_NUMBER = 5


def canonical_brand(value: str) -> str:
    """Comparison key for a maker's name; never shown or stored."""
    key = normalize_brand(value)

    return BRAND_SYNONYMS.get(key, key)


def label_has_brand(label: str, brand: str) -> bool:
    """Whether a catalogue's maker label, such as "VW (VOLKSWAGEN)" or
    "VW GROUP (AUDI/SEAT/SKODA/VW)", names the given maker."""
    wanted = canonical_brand(brand)

    return bool(wanted) and any(canonical_brand(part) == wanted for part in re.split(r"[()/,]", label))


@dataclass(frozen=True)
class LookupRequest:
    brand: str
    number: str
    number_type: str


class Adapter(ABC):
    """Looks one number up in one source.

    An adapter reports only what its source states. It must not infer crosses
    from similar-looking numbers or from shared fitment, must return numbers
    exactly as the source writes them, and must not treat a number found under
    another brand as a match.
    """

    #: Bump on any change to how the source is read.
    version: str = "1.0.0"
    #: Seconds between requests to this source's host.
    min_interval: float = 5.0

    #: Whether the source can also be asked which of its products are listed
    #: for a number of another maker (see `lookup_foreign`).
    cross_search: bool = False

    def __init__(self, http: PoliteSession) -> None:
        self.http = http

    @property
    @abstractmethod
    def source(self) -> SourceMeta:
        """The source this adapter reads."""

    @property
    @abstractmethod
    def brands(self) -> tuple[str, ...]:
        """Brands whose own numbers this source documents."""

    @property
    def name(self) -> str:
        return self.source.key

    def supports(self, request: LookupRequest) -> bool:
        """Whether this source can know the requested number at all."""
        wanted = normalize_brand(request.brand)
        return any(normalize_brand(brand) == wanted for brand in self.brands)

    def identify(self, number: str) -> list[dict[str, str | None]]:
        """Parts of any brand the source lists under exactly this number, as
        ``{"brand", "number", "title"}``. Asked when the brand is not known
        yet, so it must be one quick request. Sources that cannot be searched
        by a bare number return nothing."""
        return []

    @abstractmethod
    def lookup(self, request: LookupRequest) -> SourceResult:
        """Returns what the source says about the number.

        Raises SourceError when the source cannot be read; returns an empty
        result when the source simply does not know the number.
        """

    def lookup_foreign(self, request: LookupRequest) -> SourceResult:
        """Returns the source's own products it lists for another maker's number.

        Only for sources with `cross_search`. The same rules hold: the source
        must state the number under the requested maker; a look-alike number
        or the same number under another maker is not a match.
        """
        return SourceResult()
