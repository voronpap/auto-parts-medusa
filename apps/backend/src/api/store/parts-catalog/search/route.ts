import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import productVariantPartNumber from "../../../../links/product-variant-part-number"
import { PARTS_CATALOG_MODULE } from "../../../../modules/parts-catalog"
import PartsCatalogModuleService from "../../../../modules/parts-catalog/service"
import { normalizePartNumber } from "../../../../modules/parts-catalog/utils/normalize"

const Query = z.object({ q: z.string().trim().min(1).max(60) })

// Only confirmed crosses lead a shopper from a number to another product.
const PUBLIC_VERDICTS = ["ACCEPTED", "CONDITIONAL"] as const
const CROSS_TYPES = [
  "OEM_REFERENCE",
  "AFTERMARKET_CROSS",
  "MANUFACTURER_INTERCHANGE",
  "SUPERSEDED_BY",
] as const
// Shorter keys match too many unrelated numbers.
const MIN_KEY_LENGTH = 4
const MAX_NUMBERS = 40
const MAX_RELATED = 400

type NumberRow = {
  id: string
  display_number: string
  brand?: { name: string } | null
}

/**
 * Products for a part number typed by a shopper: the product that carries the
 * number itself, and products the catalog lists as its confirmed crosses.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const parsed = Query.safeParse(req.query)

  if (!parsed.success) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "q is required")
  }

  const key = normalizePartNumber(parsed.data.q)

  if (key.length < MIN_KEY_LENGTH || !/\d/.test(key)) {
    return res.status(200).json({ matches: [] })
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const catalog = req.scope.resolve<PartsCatalogModuleService>(
    PARTS_CATALOG_MODULE
  )
  const keys = await catalog.listPartNumberSearchKeys(
    { key },
    { relations: ["part_number", "part_number.brand"], take: MAX_NUMBERS }
  )
  const typed = new Map<string, NumberRow>()

  for (const item of keys) {
    const number = item.part_number as unknown as NumberRow | null

    if (number) {
      typed.set(number.id, number)
    }
  }

  if (!typed.size) {
    return res.status(200).json({ matches: [] })
  }

  const ids = [...typed.keys()]
  const filters = {
    relation_type: [...CROSS_TYPES],
    applicability_verdict: [...PUBLIC_VERDICTS],
    relationship_state: "ASSERTED" as const,
  }
  const [outgoing, incoming] = await Promise.all([
    catalog.listPartRelationships(
      { from_part_number_id: ids, ...filters },
      { take: MAX_RELATED }
    ),
    catalog.listPartRelationships(
      { to_part_number_id: ids, ...filters },
      { take: MAX_RELATED }
    ),
  ])
  // Number the shopper typed -> numbers stated as its crosses.
  const via = new Map<string, string>()

  for (const relationship of outgoing) {
    if (relationship.to_part_number_id) {
      via.set(relationship.to_part_number_id, relationship.from_part_number_id)
    }
  }

  for (const relationship of incoming) {
    if (relationship.to_part_number_id) {
      via.set(relationship.from_part_number_id, relationship.to_part_number_id)
    }
  }

  const candidates = [...new Set([...ids, ...via.keys()])]
  const { data: links } = await query.graph({
    entity: productVariantPartNumber.entryPoint,
    fields: ["product_variant_id", "part_number_id"],
    filters: { part_number_id: candidates },
  })

  if (!links.length) {
    return res.status(200).json({ matches: [] })
  }

  const { data: variants } = await query.graph({
    entity: "product_variant",
    fields: ["id", "product.id", "product.handle", "product.status"],
    filters: { id: links.map((link) => link.product_variant_id) },
  })
  const byVariant = new Map(variants.map((variant) => [variant.id, variant]))
  const matches = new Map<
    string,
    {
      product_id: string
      handle: string
      via: "number" | "cross"
      matched: { brand: string; number: string }
    }
  >()

  for (const link of links) {
    const product = byVariant.get(link.product_variant_id)?.product
    const direct = typed.has(link.part_number_id)
    const source = typed.get(
      direct ? link.part_number_id : via.get(link.part_number_id) ?? ""
    )

    if (!product?.handle || product.status !== "published" || !source) {
      continue
    }

    const known = matches.get(product.id)

    // The product that carries the number itself outranks a cross.
    if (known && (known.via === "number" || !direct)) {
      continue
    }

    matches.set(product.id, {
      product_id: product.id,
      handle: product.handle,
      via: direct ? "number" : "cross",
      matched: {
        brand: source.brand?.name ?? "",
        number: source.display_number,
      },
    })
  }

  return res.status(200).json({
    matches: [...matches.values()].sort(
      (a, b) => Number(b.via === "number") - Number(a.via === "number")
    ),
  })
}
