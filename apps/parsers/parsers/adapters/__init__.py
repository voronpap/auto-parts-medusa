"""Source adapters. Register each new adapter class in ADAPTERS."""

from __future__ import annotations

from .base import Adapter, LookupRequest, canonical_brand, label_has_brand, normalize_brand
from .bilstein_group import BilsteinGroupAdapter
from .bosch import BoschAdapter
from .febest import FebestAdapter
from .mann_hummel import FiltronAdapter, MannFilterAdapter
from .spareto import SparetoAdapter

# Adapter classes in the order they are tried.
ADAPTERS: list[type[Adapter]] = [
    BilsteinGroupAdapter,
    BoschAdapter,
    MannFilterAdapter,
    FiltronAdapter,
    FebestAdapter,
    # A shop: asked last, and what it says stays a candidate.
    SparetoAdapter,
]

__all__ = ["ADAPTERS", "Adapter", "LookupRequest", "canonical_brand", "label_has_brand", "normalize_brand"]
