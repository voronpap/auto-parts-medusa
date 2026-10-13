export type Brand = {
  id: string
  name: string
  kind: string
  aliases?: { id: string; alias: string }[]
}

export type Source = {
  id: string
  name: string
  kind: string
  license_class: string
  lineage: string
  url: string | null
  license_note: string | null
}

export type PartNumber = {
  id: string
  number_type: string
  source_number: string
  display_number: string
  normalized_number: string
  brand?: Brand | null
  relationship_count?: number
}

export type Evidence = {
  id: string
  raw_relation_text: string | null
  observation?: {
    id: string
    status: string
    url: string | null
    record_ref: string | null
    retrieved_at: string
    source?: Source | null
  } | null
}

export type Relationship = {
  id: string
  relation_type: string
  relationship_state: string
  applicability_verdict: string
  reason: string | null
  independent_confirmations: number
  from_part_number?: PartNumber | null
  to_part_number?: PartNumber | null
  evidence?: Evidence[]
}

export type ObservationRef = {
  id: string
  url: string | null
  source?: Source | null
} | null

export type VehicleMake = {
  id: string
  name: string
  needs_review: boolean
  aliases?: { id: string; alias: string }[]
  model_count?: number
}

export type VehicleModel = {
  id: string
  name: string
  needs_review: boolean
  aliases?: { id: string; alias: string }[]
  application_count?: number
}

export type Application = {
  id: string
  vehicle_make?: VehicleMake | null
  vehicle_model?: VehicleModel | null
  applicability_verdict: string
  make: string
  model: string | null
  generation: string | null
  year_from: number | null
  year_to: number | null
  engine: string | null
  engine_code: string | null
  power_kw: number | null
  position: string | null
  side: string | null
  constraints: Record<string, unknown> | null
  raw_text: string | null
  observation?: ObservationRef
}

export type Attribute = {
  id: string
  name: string
  value: string
  unit: string | null
  observation?: ObservationRef
}

export type LookupTask = {
  id: string
  status: string
  worker: string | null
  created_at: string
  completed_at: string | null
  summary: Record<string, number> | null
  errors: { items?: { source?: string | null; message: string }[] } | null
}

export type PartNumberDetail = {
  part_number: PartNumber
  applications: Application[]
  attributes: Attribute[]
  lookup_tasks: LookupTask[]
  outgoing: Relationship[]
  incoming: Relationship[]
  supersession_chain: PartNumber[]
}

export type BadgeColor = "green" | "red" | "orange" | "blue" | "grey" | "purple"

export const BRAND_KIND_LABELS: Record<string, string> = {
  vehicle_manufacturer: "Виробник авто",
  parts_manufacturer: "Виробник запчастин",
  supplier: "Постачальник",
}

export const NUMBER_TYPE_LABELS: Record<string, string> = {
  oem: "OEM (оригінальний)",
  oes: "OES (постачальник конвеєра)",
  aftermarket: "Aftermarket",
  supplier: "Артикул постачальника",
  trade: "Торговий номер",
  gtin: "EAN/GTIN",
  competitor: "Номер конкурента",
}

export const SOURCE_KIND_LABELS: Record<string, string> = {
  oem_catalog: "Каталог виробника авто",
  manufacturer_catalog: "Каталог виробника запчастин",
  licensed_database: "Ліцензована база",
  open_database: "Відкрита база",
  supplier_price: "Прайс постачальника",
  workshop: "СТО / майстерня",
  user: "Внесено вручну",
  ai: "AI (лише кандидати)",
}

export const LICENSE_CLASS_LABELS: Record<string, string> = {
  OPEN: "OPEN — відкриті дані",
  LICENSED: "LICENSED — за ліцензією",
  CACHE_LIMITED: "CACHE_LIMITED — обмежене зберігання",
  REFERENCE_ONLY: "REFERENCE_ONLY — лише посилання",
  USER_PROVIDED: "USER_PROVIDED — надано користувачем",
  WORKSHOP: "WORKSHOP — дані майстерні",
}

export const RELATION_TYPE_LABELS: Record<string, string> = {
  OEM_REFERENCE: "Посилання на OEM-номер",
  SUPPLIER_REFERENCE: "Посилання на номер постачальника",
  COMPETITOR_REFERENCE: "Крос на номер конкурента",
  TRADE_NUMBER: "Торговий номер",
  GTIN_IDENTIFIER: "EAN/GTIN",
  SUPERSEDED_BY: "Замінено на",
  REPLACED_BY_KIT: "Замінено комплектом",
  REPLACED_BY_GROUP: "Замінено групою деталей",
  DISCONTINUED_NO_REPLACEMENT: "Знято без заміни",
  REMAN_OF: "Відновлена версія",
  MANUFACTURER_INTERCHANGE: "Взаємозамінність від виробника",
  AFTERMARKET_CROSS: "Aftermarket-крос",
  SHARED_APPLICATION_CANDIDATE: "Кандидат: спільна застосовність",
  SPEC_MATCH_CANDIDATE: "Кандидат: збіг характеристик",
  VISUAL_OR_TEXT_CANDIDATE: "Кандидат: схожість тексту чи вигляду",
  CONTAINS: "Містить компонент",
  ACCESSORY_FOR: "Аксесуар до",
  REQUIRES: "Потребує додатково",
  MATES_WITH: "З'єднується з",
  MIRRORED_VARIANT_OF: "Дзеркальний варіант (ліва/права)",
  NOT_APPLICABLE_TO: "Не підходить до",
}

// Shown when the current number is the target of a directed relation.
export const INVERSE_RELATION_LABELS: Record<string, string> = {
  SUPERSEDED_BY: "Замінює",
  REPLACED_BY_KIT: "Комплект, що замінює",
  CONTAINS: "Входить до складу",
  REMAN_OF: "Має відновлену версію",
  ACCESSORY_FOR: "Має аксесуар",
  REQUIRES: "Потрібна для",
}

export const VERDICT_LABELS: Record<
  string,
  { label: string; color: BadgeColor }
> = {
  ACCEPTED: { label: "Підтверджено", color: "green" },
  CONDITIONAL: { label: "Умовно", color: "blue" },
  CANDIDATE: { label: "Кандидат", color: "orange" },
  REJECTED: { label: "Відхилено", color: "red" },
  UNRESOLVED: { label: "Не з'ясовано", color: "grey" },
}

export const STATE_LABELS: Record<string, string> = {
  ASSERTED: "Заявлено джерелом",
  INFERRED_CANDIDATE: "Виведено, кандидат",
  DISPUTED: "Є суперечність",
  RETRACTED: "Відкликано",
}

export const CATALOG_QUERY_KEY = "parts-catalog"

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Сталася помилка"

export const LOOKUP_STATUS_LABELS: Record<
  string,
  { label: string; color: BadgeColor }
> = {
  pending: { label: "У черзі", color: "grey" },
  claimed: { label: "Парсери працюють", color: "blue" },
  done: { label: "Виконано", color: "green" },
  failed: { label: "Помилка джерел", color: "red" },
}

export type SourceDocumentSummary = {
  id: string
  source_key: string
  source_name: string | null
  parser_version: string | null
  url: string
  http_status: number | null
  body_bytes: number
  fetched_at: string
  last_seen_at: string
}
