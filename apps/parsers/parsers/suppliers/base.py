"""The contract every supplier adapter implements.

A supplier adapter is the second kind of adapter in this service. A source
adapter answers "what does a catalogue say about this number"; a supplier
adapter answers "what does this supplier sell, for how much, and how many".
It only reads the supplier's price list and hands the rows over: matching to
the parts catalog, price history and delisting are done by the store.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass
from typing import Any, Iterator


@dataclass(frozen=True)
class SupplierMeta:
    #: Name as it is shown in the store; one supplier per name.
    name: str
    #: Currency of the price list.
    currency_code: str = "uah"
    #: Days from order to arrival, when the list does not say per row.
    lead_days: int | None = None


@dataclass(frozen=True)
class OfferRow:
    """One row of a price list, exactly as the supplier writes it.

    Price and stock are passed as written ("1 234,50", ">10", "в наявності"):
    the store parses them, so every adapter is read the same way.
    """

    brand: str
    number: str
    price: str | float
    title: str | None = None
    stock: str | float | None = None
    lead_days: int | None = None

    def to_payload(self) -> dict[str, Any]:
        return {key: value for key, value in asdict(self).items() if value is not None}


class SupplierAdapter(ABC):
    """Reads one supplier's whole price list."""

    #: Bump on any change to how the supplier is read.
    version: str = "1.0.0"

    @property
    @abstractmethod
    def supplier(self) -> SupplierMeta:
        """The supplier this adapter reads."""

    @abstractmethod
    def price_list(self) -> Iterator[OfferRow]:
        """Yields every row the supplier currently offers.

        The list must be complete: what it does not contain is taken off the
        shelf. Raise SourceError when the list cannot be read, rather than
        yielding a part of it.
        """
