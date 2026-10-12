"""Source adapters. Register each new adapter class in ADAPTERS."""

from __future__ import annotations

from .base import Adapter, LookupRequest, normalize_brand

# Adapter classes in the order they are tried.
ADAPTERS: list[type[Adapter]] = []

__all__ = ["ADAPTERS", "Adapter", "LookupRequest", "normalize_brand"]
