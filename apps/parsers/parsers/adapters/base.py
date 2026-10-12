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

    @abstractmethod
    def lookup(self, request: LookupRequest) -> SourceResult:
        """Returns what the source says about the number.

        Raises SourceError when the source cannot be read; returns an empty
        result when the source simply does not know the number.
        """
