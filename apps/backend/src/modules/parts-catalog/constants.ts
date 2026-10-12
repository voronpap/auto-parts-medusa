export const BRAND_KINDS = [
  "vehicle_manufacturer",
  "parts_manufacturer",
  "supplier",
] as const

export const NUMBER_TYPES = [
  "oem",
  "oes",
  "aftermarket",
  "supplier",
  "trade",
  "gtin",
  "competitor",
] as const

export const SOURCE_KINDS = [
  "oem_catalog",
  "manufacturer_catalog",
  "licensed_database",
  "open_database",
  "supplier_price",
  "workshop",
  "user",
  "ai",
] as const

export const LICENSE_CLASSES = [
  "OPEN",
  "LICENSED",
  "CACHE_LIMITED",
  "REFERENCE_ONLY",
  "USER_PROVIDED",
  "WORKSHOP",
] as const

export const OBSERVATION_STATUSES = [
  "active",
  "stale",
  "retracted",
  "deleted_at_source",
] as const

// Canonical relation dictionary. SUPERSEDES, COMPONENT_OF and WHERE_USED are
// inverse views of SUPERSEDED_BY, CONTAINS and APPLIES_TO and are derived by
// querying the opposite direction, so they are never stored.
export const RELATION_TYPES = [
  "OEM_REFERENCE",
  "SUPPLIER_REFERENCE",
  "COMPETITOR_REFERENCE",
  "TRADE_NUMBER",
  "GTIN_IDENTIFIER",
  "SUPERSEDED_BY",
  "REPLACED_BY_KIT",
  "REPLACED_BY_GROUP",
  "DISCONTINUED_NO_REPLACEMENT",
  "REMAN_OF",
  "MANUFACTURER_INTERCHANGE",
  "AFTERMARKET_CROSS",
  "SHARED_APPLICATION_CANDIDATE",
  "SPEC_MATCH_CANDIDATE",
  "VISUAL_OR_TEXT_CANDIDATE",
  "CONTAINS",
  "ACCESSORY_FOR",
  "REQUIRES",
  "MATES_WITH",
  "MIRRORED_VARIANT_OF",
  "NOT_APPLICABLE_TO",
] as const

// Inferred relations: discovery hints that can never be accepted on their own.
export const CANDIDATE_ONLY_RELATION_TYPES: readonly RelationType[] = [
  "SHARED_APPLICATION_CANDIDATE",
  "SPEC_MATCH_CANDIDATE",
  "VISUAL_OR_TEXT_CANDIDATE",
]

export const RELATIONSHIP_STATES = [
  "ASSERTED",
  "INFERRED_CANDIDATE",
  "DISPUTED",
  "RETRACTED",
] as const

export const APPLICABILITY_VERDICTS = [
  "ACCEPTED",
  "CONDITIONAL",
  "CANDIDATE",
  "REJECTED",
  "UNRESOLVED",
] as const

export type BrandKind = (typeof BRAND_KINDS)[number]
export type NumberType = (typeof NUMBER_TYPES)[number]
export type SourceKind = (typeof SOURCE_KINDS)[number]
export type LicenseClass = (typeof LICENSE_CLASSES)[number]
export type ObservationStatus = (typeof OBSERVATION_STATUSES)[number]
export type RelationType = (typeof RELATION_TYPES)[number]
export type RelationshipState = (typeof RELATIONSHIP_STATES)[number]
export type ApplicabilityVerdict = (typeof APPLICABILITY_VERDICTS)[number]
