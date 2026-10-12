import { z } from "@medusajs/framework/zod"
import {
  LICENSE_CLASSES,
  NUMBER_TYPES,
  RELATION_TYPES,
} from "../../../../modules/parts-catalog/constants"

const text = (max: number) => z.string().max(max)
const optionalText = (max: number) => z.string().max(max).nullish()

// Kinds a parser may declare. "ai" and "user" are not sources a parser reads.
const WORKER_SOURCE_KINDS = [
  "oem_catalog",
  "manufacturer_catalog",
  "licensed_database",
  "open_database",
  "supplier_price",
  "workshop",
] as const

const NumberRefSchema = z.object({
  brand: text(200).min(1),
  number_type: z.enum(NUMBER_TYPES),
  number: text(100).min(1),
})

export const CreateLookupTaskSchema = z.object({
  part_number_id: z.string().min(1),
})

export const ClaimLookupTasksSchema = z.object({
  worker: text(100).min(1),
  limit: z.number().int().min(1).max(20).default(5),
})

export const LookupResultSchema = z.object({
  worker: optionalText(100),
  sources: z
    .array(
      z.object({
        key: text(100).min(1),
        name: text(200).min(1),
        kind: z.enum(WORKER_SOURCE_KINDS),
        license_class: z.enum(LICENSE_CLASSES),
        lineage: optionalText(200),
        url: optionalText(2000),
        license_note: optionalText(2000),
        parser: z
          .object({ name: optionalText(100), version: optionalText(50) })
          .nullish(),
        catalog_version: optionalText(100),
        retrieved_at: optionalText(40),
      })
    )
    .max(50)
    .default([]),
  relationships: z
    .array(
      z.object({
        source: text(100).min(1),
        to: NumberRefSchema.nullish(),
        direction: z.enum(["outgoing", "incoming"]).nullish(),
        relation_type: z.enum(RELATION_TYPES),
        raw_relation_text: optionalText(2000),
        ambiguous: z.boolean().nullish(),
        constraints: z.record(z.string(), z.unknown()).nullish(),
        reason: optionalText(2000),
        record_ref: optionalText(500),
        record_url: optionalText(2000),
      })
    )
    .max(500)
    .default([]),
  applications: z
    .array(
      z.object({
        source: text(100).min(1),
        make: text(100).min(1),
        model: optionalText(200),
        generation: optionalText(200),
        body: optionalText(100),
        market: optionalText(50),
        year_from: z.number().int().min(1900).max(2100).nullish(),
        year_to: z.number().int().min(1900).max(2100).nullish(),
        engine: optionalText(200),
        engine_code: optionalText(100),
        power_kw: z.number().min(0).max(5000).nullish(),
        fuel: optionalText(50),
        drivetrain: optionalText(50),
        transmission: optionalText(100),
        position: optionalText(50),
        side: optionalText(50),
        quantity: z.number().min(0).max(1000).nullish(),
        constraints: z.record(z.string(), z.unknown()).nullish(),
        raw_text: optionalText(2000),
        record_ref: optionalText(500),
        record_url: optionalText(2000),
      })
    )
    .max(1000)
    .default([]),
  attributes: z
    .array(
      z.object({
        source: text(100).min(1),
        name: text(200).min(1),
        value: text(500).min(1),
        unit: optionalText(50),
        raw_text: optionalText(2000),
      })
    )
    .max(300)
    .default([]),
  errors: z
    .array(
      z.object({
        source: optionalText(100),
        message: text(2000),
      })
    )
    .max(50)
    .default([]),
})

export type CreateLookupTaskBody = z.infer<typeof CreateLookupTaskSchema>
export type ClaimLookupTasksBody = z.infer<typeof ClaimLookupTasksSchema>
export type LookupResultBody = z.infer<typeof LookupResultSchema>
