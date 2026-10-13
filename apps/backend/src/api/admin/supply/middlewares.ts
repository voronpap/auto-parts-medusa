import {
  MiddlewareRoute,
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { NUMBER_TYPES } from "../../../modules/parts-catalog/constants"

const toInt = (value: unknown) =>
  typeof value === "string" ? Number.parseInt(value, 10) : value

export const CreateSupplierSchema = z.object({
  name: z.string().trim().min(1).max(200),
  currency_code: z.string().trim().length(3).optional(),
  lead_days: z.number().int().min(0).max(365).nullish(),
  note: z.string().max(2000).nullish(),
})

export const OpenImportRunSchema = z.object({
  file_name: z.string().max(300).nullish(),
})

export const ImportRowsSchema = z.object({
  rows: z
    .array(
      z.object({
        brand: z.string().max(200),
        number: z.string().max(100),
        title: z.string().max(1000).nullish(),
        price: z.union([z.string().max(40), z.number()]),
        stock: z.union([z.string().max(100), z.number()]).nullish(),
        lead_days: z.number().int().min(0).max(365).nullish(),
      })
    )
    .min(1)
    .max(1000),
})

export const ListOffersSchema = z.object({
  limit: z.preprocess(toInt, z.number().int().min(1).max(200).default(50)),
  offset: z.preprocess(toInt, z.number().int().min(0).default(0)),
  part_number_id: z.string().min(1).optional(),
  supplier_id: z.string().min(1).optional(),
  q: z.string().trim().min(1).max(100).optional(),
})

export const UpdatePricingSchema = z.object({
  default_markup_percent: z.number().min(0).max(1000).nullish(),
  rounding_step: z.number().min(0.01).max(1000).optional(),
  sync_stock: z.boolean().optional(),
})

export const CreatePricingRuleSchema = z.object({
  brand: z.string().trim().max(200).nullish(),
  price_from: z.number().min(0).max(10_000_000).nullish(),
  price_to: z.number().min(0).max(10_000_000).nullish(),
  markup_percent: z.number().min(0).max(1000),
})

export const ProductDraftSchema = z.object({
  q: z.string().trim().min(1).max(100),
})

export const CreateProductDraftSchema = z.object({
  brand: z.string().trim().min(1).max(200),
  number: z.string().trim().min(1).max(100),
  number_type: z.enum(NUMBER_TYPES).default("aftermarket"),
  title: z.string().trim().min(1).max(300),
  purchase_price: z.number().positive().max(10_000_000),
  quantity: z.number().int().min(0).max(100_000).default(0),
})

export type ProductDraftQuery = z.infer<typeof ProductDraftSchema>
export type CreateProductDraftBody = z.infer<typeof CreateProductDraftSchema>
export type UpdatePricingBody = z.infer<typeof UpdatePricingSchema>
export type CreatePricingRuleBody = z.infer<typeof CreatePricingRuleSchema>
export type CreateSupplierBody = z.infer<typeof CreateSupplierSchema>
export type OpenImportRunBody = z.infer<typeof OpenImportRunSchema>
export type ImportRowsBody = z.infer<typeof ImportRowsSchema>
export type ListOffersQuery = z.infer<typeof ListOffersSchema>

export const supplyMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/admin/supply/suppliers",
    method: "POST",
    middlewares: [validateAndTransformBody(CreateSupplierSchema)],
  },
  {
    matcher: "/admin/supply/suppliers/:id/import-runs",
    method: "POST",
    middlewares: [validateAndTransformBody(OpenImportRunSchema)],
  },
  {
    matcher: "/admin/supply/import-runs/:id/rows",
    method: "POST",
    bodyParser: { sizeLimit: "2mb" },
    middlewares: [validateAndTransformBody(ImportRowsSchema)],
  },
  {
    matcher: "/admin/supply/pricing",
    method: "POST",
    middlewares: [validateAndTransformBody(UpdatePricingSchema)],
  },
  {
    matcher: "/admin/supply/pricing/rules",
    method: "POST",
    middlewares: [validateAndTransformBody(CreatePricingRuleSchema)],
  },
  {
    matcher: "/admin/supply/product-draft",
    method: "GET",
    middlewares: [validateAndTransformQuery(ProductDraftSchema, {})],
  },
  {
    matcher: "/admin/supply/product-draft",
    method: "POST",
    middlewares: [validateAndTransformBody(CreateProductDraftSchema)],
  },
  {
    matcher: "/admin/supply/offers",
    method: "GET",
    middlewares: [validateAndTransformQuery(ListOffersSchema, { isList: true })],
  },
]
