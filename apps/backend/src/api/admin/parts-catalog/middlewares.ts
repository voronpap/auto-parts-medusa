import {
  MiddlewareRoute,
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import {
  APPLICABILITY_VERDICTS,
  BRAND_KINDS,
  LICENSE_CLASSES,
  NUMBER_TYPES,
  RELATION_TYPES,
  RELATIONSHIP_STATES,
  SOURCE_KINDS,
} from "../../../modules/parts-catalog/constants"
import {
  ClaimLookupTasksSchema,
  CreateLookupTaskSchema,
  ImportResultSchema,
  LookupResultSchema,
} from "./lookup-tasks/schemas"

const toInt = (value: unknown) =>
  typeof value === "string" ? Number.parseInt(value, 10) : value

const pagination = {
  limit: z.preprocess(toInt, z.number().int().min(1).max(100).default(50)),
  offset: z.preprocess(toInt, z.number().int().min(0).default(0)),
}

export const ListCatalogSchema = z.object({
  ...pagination,
  q: z.string().trim().min(1).max(100).optional(),
})

export const CreateBrandSchema = z.object({
  name: z.string().trim().min(1).max(200),
  kind: z.enum(BRAND_KINDS).optional(),
  aliases: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
})

export const UpdateBrandSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  kind: z.enum(BRAND_KINDS).optional(),
  aliases: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
})

export const MergeBrandsSchema = z.object({
  source_id: z.string().min(1),
  target_id: z.string().min(1),
})

export const UpdatePartRelationshipSchema = z.object({
  applicability_verdict: z.enum(APPLICABILITY_VERDICTS).optional(),
  relationship_state: z.enum(RELATIONSHIP_STATES).optional(),
  reason: z.string().max(2000).nullish(),
})

export const NumberSearchResultSchema = z.object({
  worker: z.string().max(200).nullish(),
  candidates: z
    .array(
      z.object({
        brand: z.string().trim().min(1).max(200),
        number: z.string().trim().min(1).max(100),
        title: z.string().max(300).nullish(),
        source: z.string().trim().min(1).max(100),
      })
    )
    .max(100),
  errors: z
    .array(
      z.object({
        source: z.string().max(100).nullish(),
        message: z.string().max(2000),
      })
    )
    .max(50)
    .default([]),
})

export type NumberSearchResultBody = z.infer<typeof NumberSearchResultSchema>
export type UpdateBrandBody = z.infer<typeof UpdateBrandSchema>
export type MergeBrandsBody = z.infer<typeof MergeBrandsSchema>
export type UpdatePartRelationshipBody = z.infer<
  typeof UpdatePartRelationshipSchema
>

// A page of a catalogue can be large; what one request may carry is
// bounded by the body limit of the route.
export const ArchiveDocumentsSchema = z.object({
  number: z
    .object({
      brand: z.string().trim().min(1).max(200),
      number_type: z.enum(NUMBER_TYPES),
      number: z.string().trim().min(1).max(100),
    })
    .nullish(),
  documents: z
    .array(
      z.object({
        source_key: z.string().trim().min(1).max(100),
        source_name: z.string().max(200).nullish(),
        parser_name: z.string().max(100).nullish(),
        parser_version: z.string().max(100).nullish(),
        request_key: z.string().min(8).max(128),
        method: z.string().max(10).nullish(),
        url: z.string().min(1).max(4000),
        params: z.record(z.string(), z.unknown()).nullish(),
        http_status: z.number().int().nullish(),
        body: z.string().max(6_000_000),
        fetched_at: z.string().max(40).nullish(),
      })
    )
    .min(1)
    .max(50),
})

export const ListDocumentsSchema = z.object({
  ...pagination,
  part_number_id: z.string().min(1).optional(),
  source_key: z.string().min(1).optional(),
})

export type ArchiveDocumentsBody = z.infer<typeof ArchiveDocumentsSchema>
export type ListDocumentsQuery = z.infer<typeof ListDocumentsSchema>

export const CreateSourceSchema = z.object({
  name: z.string().trim().min(1).max(200),
  kind: z.enum(SOURCE_KINDS),
  license_class: z.enum(LICENSE_CLASSES),
  lineage: z.string().trim().max(200).optional(),
  url: z.string().trim().max(2000).nullish(),
  license_note: z.string().trim().max(2000).nullish(),
})

export const CreatePartNumberSchema = z.object({
  brand_id: z.string().min(1),
  number_type: z.enum(NUMBER_TYPES),
  number: z.string().trim().min(1).max(100),
})

const EvidenceSchema = z.object({
  source_id: z.string().min(1),
  record_ref: z.string().max(500).nullish(),
  url: z.string().max(2000).nullish(),
  catalog_version: z.string().max(100).nullish(),
  parser_version: z.string().max(100).nullish(),
  retrieved_at: z.string().max(40).nullish(),
  raw_relation_text: z.string().max(2000).nullish(),
  source_semantics: z.string().max(200).nullish(),
})

export const CreatePartRelationshipSchema = z.object({
  from_part_number_id: z.string().min(1),
  to_part_number_id: z.string().min(1).nullish(),
  relation_type: z.enum(RELATION_TYPES),
  relationship_state: z.enum(RELATIONSHIP_STATES).optional(),
  applicability_verdict: z.enum(APPLICABILITY_VERDICTS).optional(),
  constraints: z.record(z.string(), z.unknown()).nullish(),
  reason: z.string().max(2000).nullish(),
  valid_from: z.string().max(40).nullish(),
  valid_to: z.string().max(40).nullish(),
  evidence: z.array(EvidenceSchema).max(20).optional(),
})

export const CreateVehicleMakeSchema = z.object({
  name: z.string().trim().min(1).max(100),
  aliases: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
})

export const MergeVehiclesSchema = z.object({
  source_id: z.string().min(1),
  target_id: z.string().min(1),
})

export type CreateVehicleMakeBody = z.infer<typeof CreateVehicleMakeSchema>
export type MergeVehiclesBody = z.infer<typeof MergeVehiclesSchema>
export const CatalogProductSchema = z.object({
  brand_id: z.string().min(1),
  number_type: z.enum(NUMBER_TYPES),
})

export type CatalogProductBody = z.infer<typeof CatalogProductSchema>
export type ListCatalogQuery = z.infer<typeof ListCatalogSchema>
export type CreateBrandBody = z.infer<typeof CreateBrandSchema>
export type CreateSourceBody = z.infer<typeof CreateSourceSchema>
export type CreatePartNumberBody = z.infer<typeof CreatePartNumberSchema>
export type CreatePartRelationshipBody = z.infer<
  typeof CreatePartRelationshipSchema
>

const listQuery = validateAndTransformQuery(ListCatalogSchema, { isList: true })

export const partsCatalogMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/admin/parts-catalog/brands",
    method: "GET",
    middlewares: [listQuery],
  },
  {
    matcher: "/admin/parts-catalog/brands",
    method: "POST",
    middlewares: [validateAndTransformBody(CreateBrandSchema)],
  },
  {
    matcher: "/admin/parts-catalog/brands/merge",
    method: "POST",
    middlewares: [validateAndTransformBody(MergeBrandsSchema)],
  },
  {
    matcher: "/admin/parts-catalog/brands/:id",
    method: "POST",
    middlewares: [validateAndTransformBody(UpdateBrandSchema)],
  },
  {
    matcher: "/admin/parts-catalog/relationships/:id",
    method: "POST",
    middlewares: [validateAndTransformBody(UpdatePartRelationshipSchema)],
  },
  {
    matcher: "/admin/parts-catalog/documents",
    method: "GET",
    middlewares: [validateAndTransformQuery(ListDocumentsSchema, { isList: true })],
  },
  {
    matcher: "/admin/parts-catalog/documents",
    method: "POST",
    bodyParser: { sizeLimit: "8mb" },
    middlewares: [validateAndTransformBody(ArchiveDocumentsSchema)],
  },
  {
    matcher: "/admin/parts-catalog/sources",
    method: "GET",
    middlewares: [listQuery],
  },
  {
    matcher: "/admin/parts-catalog/sources",
    method: "POST",
    middlewares: [validateAndTransformBody(CreateSourceSchema)],
  },
  {
    matcher: "/admin/parts-catalog/part-numbers",
    method: "GET",
    middlewares: [listQuery],
  },
  {
    matcher: "/admin/parts-catalog/part-numbers",
    method: "POST",
    middlewares: [validateAndTransformBody(CreatePartNumberSchema)],
  },
  {
    matcher: "/admin/parts-catalog/relationships",
    method: "POST",
    middlewares: [validateAndTransformBody(CreatePartRelationshipSchema)],
  },
  {
    matcher: "/admin/parts-catalog/vehicle-makes",
    method: "POST",
    middlewares: [validateAndTransformBody(CreateVehicleMakeSchema)],
  },
  {
    matcher: "/admin/parts-catalog/vehicle-makes/merge",
    method: "POST",
    middlewares: [validateAndTransformBody(MergeVehiclesSchema)],
  },
  {
    matcher: "/admin/parts-catalog/vehicle-models/merge",
    method: "POST",
    middlewares: [validateAndTransformBody(MergeVehiclesSchema)],
  },
  {
    matcher: "/admin/parts-catalog/products/:id",
    method: "POST",
    middlewares: [validateAndTransformBody(CatalogProductSchema)],
  },
  {
    matcher: "/admin/parts-catalog/import",
    method: "POST",
    bodyParser: { sizeLimit: "8mb" },
    middlewares: [validateAndTransformBody(ImportResultSchema)],
  },
  {
    matcher: "/admin/parts-catalog/lookup-tasks",
    method: "POST",
    middlewares: [validateAndTransformBody(CreateLookupTaskSchema)],
  },
  {
    matcher: "/admin/parts-catalog/number-searches/:id/result",
    method: "POST",
    middlewares: [validateAndTransformBody(NumberSearchResultSchema)],
  },
  {
    matcher: "/admin/parts-catalog/lookup-tasks/claim",
    method: "POST",
    middlewares: [validateAndTransformBody(ClaimLookupTasksSchema)],
  },
  {
    matcher: "/admin/parts-catalog/lookup-tasks/:id/result",
    method: "POST",
    // A result can carry thousands of fitment rows.
    bodyParser: { sizeLimit: "8mb" },
    middlewares: [validateAndTransformBody(LookupResultSchema)],
  },
]
