"""Source adapters. Register each new adapter class in ADAPTERS."""

from __future__ import annotations

from .base import Adapter, LookupRequest, canonical_brand, label_has_brand, normalize_brand
from .bilstein_group import BilsteinGroupAdapter
from .bosch import BoschAdapter
from .febest import FebestAdapter
from .facet import FacetAdapter
from .eps import EpsAdapter
from .kw_facet import KwFacetAdapter
from .mg_egypt import MgEgyptAdapter
from .geely_ksa import GeelyKsaAdapter
from .mann_hummel import FiltronAdapter, MannFilterAdapter
from .metelli import MetelliAdapter
from .ctr import CtrAdapter
from .nibk import NibkAdapter
from .nissens import NissensAdapter
from .nrf import NrfAdapter
from .zf import ZfAdapter
from .spareto import SparetoAdapter

# Adapter classes in the order they are tried.
ADAPTERS: list[type[Adapter]] = [
    BilsteinGroupAdapter,
    BoschAdapter,
    MannFilterAdapter,
    FiltronAdapter,
    FebestAdapter,
    NibkAdapter,
    NissensAdapter,
    NrfAdapter,
    ZfAdapter,
    GeelyKsaAdapter,
    MetelliAdapter,
    CtrAdapter,
    FacetAdapter,
    EpsAdapter,
    KwFacetAdapter,
    MgEgyptAdapter,
    # A shop: asked last, and what it says stays a candidate.
    SparetoAdapter,
]

__all__ = ["ADAPTERS", "Adapter", "LookupRequest", "canonical_brand", "label_has_brand", "normalize_brand"]
