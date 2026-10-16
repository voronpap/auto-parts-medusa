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
// Products found by the start of a number; a short prefix matches many.
const MAX_PREFIX = 20
const LINK_TABLE = "product_product_variant_partscatalog_part_number"
const RANK = { number: 0, cross: 1, prefix: 2 } as const

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

  // Numbers that start with the typed key and belong to a product. Only those
  // are looked up, so a short prefix does not pull in the whole catalog, and
  // their crosses are not followed.
  const db = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const prefixed: { part_number_id: string }[] = await db
    .select("k.part_number_id")
    .from({ k: "part_number_search_key" })
    .join({ l: LINK_TABLE }, "l.part_number_id", "k.part_number_id")
    .where("k.key", "like", `${key.replace(/[\\%_]/g, "\\$&")}%`)
    .andWhere("k.key", "<>", key)
    .whereNull("k.deleted_at")
    .whereNull("l.deleted_at")
    .groupBy("k.part_number_id")
    .orderByRaw("min(k.key)")
    .limit(MAX_PREFIX)
  const prefixIds = prefixed
    .map((row) => row.part_number_id)
    .filter((id) => !typed.has(id))
  const partial = new Map<string, NumberRow>()

  if (prefixIds.length) {
    const numbers = (await catalog.listPartNumbers(
      { id: prefixIds },
      { relations: ["brand"], take: null }
    )) as unknown as NumberRow[]

    for (const number of numbers) {
      partial.set(number.id, number)
    }
  }

  if (!typed.size && !partial.size) {
    return res.status(200).json({ matches: [] })
  }

  const ids = [...typed.keys()]
  const filters = {
    relation_type: [...CROSS_TYPES],
    applicability_verdict: [...PUBLIC_VERDICTS],
    relationship_state: "ASSERTED" as const,
  }
  const [outgoing, incoming] = ids.length ? await Promise.all([
    catalog.listPartRelationships(
      { from_part_number_id: ids, ...filters },
      { take: MAX_RELATED }
    ),
    catalog.listPartRelationships(
      { to_part_number_id: ids, ...filters },
      { take: MAX_RELATED }
    ),
  ]) : [[], []]
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

  const candidates = [...new Set([...ids, ...partial.keys(), ...via.keys()])]
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
      via: "number" | "cross" | "prefix"
      matched: { brand: string; number: string }
    }
  >()

  for (const link of links) {
    const product = byVariant.get(link.product_variant_id)?.product
    const direct = typed.has(link.part_number_id)
    const cross = via.get(link.part_number_id)
    const kind = direct ? "number" : cross ? "cross" : "prefix"
    const source = direct
      ? typed.get(link.part_number_id)
      : cross
        ? typed.get(cross)
        : partial.get(link.part_number_id)

    if (!product?.handle || product.status !== "published" || !source) {
      continue
    }

    const known = matches.get(product.id)

    // The typed number outranks a cross, and a cross a partial match.
    if (known && RANK[known.via] <= RANK[kind]) {
      continue
    }

    matches.set(product.id, {
      product_id: product.id,
      handle: product.handle,
      via: kind,
      matched: {
        brand: source.brand?.name ?? "",
        number: source.display_number,
      },
    })
  }

  return res.status(200).json({
    matches: [...matches.values()].sort((a, b) => RANK[a.via] - RANK[b.via]),
  })
}
