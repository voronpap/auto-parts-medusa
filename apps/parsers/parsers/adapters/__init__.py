"""Source adapters. Register each new adapter class in ADAPTERS."""

from __future__ import annotations

from .base import Adapter, LookupRequest, canonical_brand, label_has_brand, normalize_brand
from .bilstein_group import BilsteinGroupAdapter
from .bosch import BoschAdapter
from .febest import FebestAdapter
from .mann_hummel import FiltronAdapter, MannFilterAdapter
from .nibk import NibkAdapter

# Adapter classes in the order they are tried.
ADAPTERS: list[type[Adapter]] = [
    BilsteinGroupAdapter,
    BoschAdapter,
    MannFilterAdapter,
    FiltronAdapter,
    FebestAdapter,
    NibkAdapter,
]

__all__ = ["ADAPTERS", "Adapter", "LookupRequest", "canonical_brand", "label_has_brand", "normalize_brand"]
