"""Source adapters. Register each new adapter class in ADAPTERS."""

from __future__ import annotations

from .base import Adapter, LookupRequest, normalize_brand
from .bilstein_group import BilsteinGroupAdapter
from .bosch import BoschAdapter

# Adapter classes in the order they are tried.
ADAPTERS: list[type[Adapter]] = [BilsteinGroupAdapter, BoschAdapter]

__all__ = ["ADAPTERS", "Adapter", "LookupRequest", "normalize_brand"]
