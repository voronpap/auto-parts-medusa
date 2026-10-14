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
import { SUPPLY_MODULE } from "../../../../modules/supply"
import SupplyModuleService from "../../../../modules/supply/service"
import { markupFor, shopPriceMinor } from "../../../../modules/supply/utils/markup"

const Query = z.object({ q: z.string().trim().min(1).max(60) })

// Only confirmed crosses are offered as a replacement for the typed number.
const PUBLIC_VERDICTS = ["ACCEPTED", "CONDITIONAL"] as const
const CROSS_TYPES = [
  "OEM_REFERENCE",
  "AFTERMARKET_CROSS",
  "MANUFACTURER_INTERCHANGE",
  "SUPERSEDED_BY",
] as const
const MIN_KEY_LENGTH = 4
const MAX_NUMBERS = 40
const MAX_RELATED = 600
const MAX_OFFERS = 300

type NumberRow = {
  id: string
  brand_id: string
  display_number: string
  normalized_number: string
  number_type: string
  brand?: { name: string; normalized_name: string } | null
}

export type PublicOffer = {
  offer_id: string
  brand: string
  number: string
  title: string | null
  price: number
  currency_code: string
  in_stock: boolean
  stock_quantity: number | null
  lead_days: number | null
  /** "number": the part typed; "cross": a confirmed analog of it. */
  via: "number" | "cross"
  matched: { brand: string; number: string } | null
  product_handle: string | null
}

/**
 * What a shopper can buy for a typed part number: suppliers' offers for the
 * number itself and for its confirmed crosses, at the shop's price. Supplier
 * names and purchase prices are not shown.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const parsed = Query.safeParse(req.query)

  if (!parsed.success) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "q is required")
  }

  const key = normalizePartNumber(parsed.data.q)

  if (key.length < MIN_KEY_LENGTH || !/\d/.test(key)) {
    return res.status(200).json({ offers: [] })
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const catalog = req.scope.resolve<PartsCatalogModuleService>(PARTS_CATALOG_MODULE)
  const supply = req.scope.resolve<SupplyModuleService>(SUPPLY_MODULE)
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

  // Cross number -> the typed number it is an analog of.
  const via = new Map<string, string>()

  if (typed.size) {
    const ids = [...typed.keys()]
    const filters = {
      relation_type: [...CROSS_TYPES],
      applicability_verdict: [...PUBLIC_VERDICTS],
      relationship_state: "ASSERTED" as const,
    }
    const [outgoing, incoming] = await Promise.all([
      catalog.listPartRelationships({ from_part_number_id: ids, ...filters }, { take: MAX_RELATED }),
      catalog.listPartRelationships({ to_part_number_id: ids, ...filters }, { take: MAX_RELATED }),
    ])

    for (const relationship of outgoing) {
      if (relationship.to_part_number_id && !typed.has(relationship.to_part_number_id)) {
        via.set(relationship.to_part_number_id, relationship.from_part_number_id)
      }
    }

    for (const relationship of incoming) {
      if (relationship.to_part_number_id && !typed.has(relationship.from_part_number_id)) {
        via.set(relationship.from_part_number_id, relationship.to_part_number_id)
      }
    }
  }

  const crosses = via.size
    ? ((await catalog.listPartNumbers(
        { id: [...via.keys()] },
        { relations: ["brand"], take: null }
      )) as unknown as NumberRow[])
    : []
  // Offers are matched by number and brand: most of a price list is not linked
  // to catalog records one by one.
  const wanted = new Map<string, NumberRow>()

  for (const number of [...typed.values(), ...crosses]) {
    if (number.brand) {
      wanted.set(`${number.brand.normalized_name}|${number.normalized_number}`, number)
    }
  }

  const numberKeys = [...new Set([key, ...crosses.map((number) => number.normalized_number)])]
  const offers = await supply.listSupplierOffers(
    { normalized_number: numberKeys, is_listed: true },
    { relations: ["supplier"], take: MAX_OFFERS * 2, order: { price_minor: "ASC" } }
  )
  const offerBrands = [...new Set(offers.map((offer) => offer.normalized_brand))]
  const aliases = offerBrands.length
    ? await catalog.listBrandAliasRecords(
        { normalized_alias: offerBrands },
        { relations: ["brand"], take: null }
      )
    : []
  const brandKey = new Map(aliases.map((alias) => [alias.normalized_alias, alias.brand.normalized_name]))
  const [settings] = await supply.listPricingSettings({}, { take: 1 })
  const rules = await supply.listPricingRules({}, { take: null })
  const rows: (PublicOffer & { part_number_id: string | null })[] = []

  for (const offer of offers) {
    const brand = brandKey.get(offer.normalized_brand) ?? offer.normalized_brand
    const number = wanted.get(`${brand}|${offer.normalized_number}`)
    const isTyped = offer.normalized_number === key
    const crossOf = number && !typed.has(number.id) ? typed.get(via.get(number.id) ?? "") : undefined

    // A cross is offered only under the brand the catalog names; the typed
    // number is offered under any brand that sells it.
    if (!isTyped && !crossOf) {
      continue
    }

    const markup = markupFor(rules, settings?.default_markup_bp ?? null, brand, offer.price_minor)

    if (markup == null) {
      continue
    }

    rows.push({
      offer_id: offer.id,
      brand: offer.brand,
      number: offer.number,
      title: offer.title,
      price: shopPriceMinor(offer.price_minor, markup, settings?.rounding_minor ?? 100) / 100,
      currency_code: offer.currency_code,
      in_stock: (offer.stock_quantity ?? 0) > 0,
      stock_quantity: offer.stock_quantity,
      lead_days: offer.lead_days ?? offer.supplier?.lead_days ?? null,
      via: isTyped ? "number" : "cross",
      matched: crossOf
        ? { brand: crossOf.brand?.name ?? "", number: crossOf.display_number }
        : null,
      product_handle: null,
      part_number_id: number?.id ?? offer.part_number_id ?? null,
    })
  }

  // Offers that already have a product open its page.
  const linked = rows.map((row) => row.part_number_id).filter((id): id is string => Boolean(id))

  if (linked.length) {
    const { data: links } = await query.graph({
      entity: productVariantPartNumber.entryPoint,
      fields: ["part_number_id", "product_variant.product.handle", "product_variant.product.status"],
      filters: { part_number_id: [...new Set(linked)] },
    })
    const handleOf = new Map(
      links
        .filter((link) => link.product_variant?.product?.status === "published")
        .map((link) => [link.part_number_id, link.product_variant!.product!.handle as string])
    )

    for (const row of rows) {
      row.product_handle = row.part_number_id ? handleOf.get(row.part_number_id) ?? null : null
    }
  }

  rows.sort(
    (a, b) =>
      Number(b.via === "number") - Number(a.via === "number") ||
      Number(b.in_stock) - Number(a.in_stock) ||
      a.price - b.price
  )

  return res.status(200).json({
    offers: rows.slice(0, MAX_OFFERS).map(({ part_number_id: _, ...row }) => row),
  })
}
