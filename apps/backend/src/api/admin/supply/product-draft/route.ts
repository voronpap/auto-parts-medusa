import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import productVariantPartNumber from "../../../../links/product-variant-part-number"
import { PARTS_CATALOG_MODULE } from "../../../../modules/parts-catalog"
import PartsCatalogModuleService from "../../../../modules/parts-catalog/service"
import { normalizePartNumber } from "../../../../modules/parts-catalog/utils/normalize"
import { SUPPLY_MODULE } from "../../../../modules/supply"
import SupplyModuleService from "../../../../modules/supply/service"
import { createProductByNumberWorkflow } from "../../../../workflows/supply"
import { CreateProductDraftBody, ProductDraftQuery } from "../middlewares"

type Candidate = {
  brand: string
  number: string
  number_type: string
  title: string | null
  part_number_id: string | null
  product_id: string | null
  offers: {
    supplier: string
    price: number
    currency_code: string
    stock_quantity: number | null
  }[]
}

/**
 * What the shop already knows about a typed number: the parts of every
 * brand that carry it in the parts catalog and in suppliers' price lists.
 */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const { q } = req.validatedQuery as ProductDraftQuery
  const normalized = normalizePartNumber(q)
  const catalog = req.scope.resolve<PartsCatalogModuleService>(PARTS_CATALOG_MODULE)
  const supply = req.scope.resolve<SupplyModuleService>(SUPPLY_MODULE)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  if (!normalized) {
    return res.status(200).json({ candidates: [] })
  }

  const [numbers, offers] = await Promise.all([
    catalog.listPartNumbers(
      { normalized_number: normalized },
      { relations: ["brand"], take: 30 }
    ),
    supply.listSupplierOffers(
      { normalized_number: normalized, is_listed: true },
      { relations: ["supplier"], take: 60, order: { price_minor: "ASC" } }
    ),
  ])
  const offerBrands = [...new Set(offers.map((offer) => offer.normalized_brand))]
  const aliases = offerBrands.length
    ? await catalog.listBrandAliasRecords(
        { normalized_alias: offerBrands },
        { relations: ["brand"], take: null }
      )
    : []
  // A supplier's spelling of a brand is led to the catalog's brand.
  const brandKey = new Map(
    aliases.map((alias) => [alias.normalized_alias, alias.brand.normalized_name])
  )
  const candidates = new Map<string, Candidate>()

  for (const number of numbers) {
    candidates.set(`${number.brand.normalized_name}|${number.number_type}`, {
      brand: number.brand.name,
      number: number.display_number,
      number_type: number.number_type,
      title: null,
      part_number_id: number.id,
      product_id: null,
      offers: [],
    })
  }

  for (const offer of offers) {
    const key = `${brandKey.get(offer.normalized_brand) ?? offer.normalized_brand}|aftermarket`
    const candidate = candidates.get(key) ?? {
      brand: offer.brand,
      number: offer.number,
      number_type: "aftermarket",
      title: null,
      part_number_id: null,
      product_id: null,
      offers: [],
    }

    candidate.title = candidate.title ?? (offer.title?.trim() || null)
    candidate.offers.push({
      supplier: offer.supplier?.name ?? "",
      price: offer.price_minor / 100,
      currency_code: offer.currency_code,
      stock_quantity: offer.stock_quantity,
    })
    candidates.set(key, candidate)
  }

  const numberIds = numbers.map((number) => number.id)

  if (numberIds.length) {
    const [{ data: links }, names] = await Promise.all([
      query.graph({
        entity: productVariantPartNumber.entryPoint,
        fields: ["part_number_id", "product_variant.product_id"],
        filters: { part_number_id: numberIds },
      }),
      catalog.listPartAttributes(
        { part_number_id: numberIds, name: ["Назва", "Назва (англ.)"] },
        { select: ["part_number_id", "name", "value"], take: null }
      ),
    ])

    for (const candidate of candidates.values()) {
      const linked = links.find((row) => row.part_number_id === candidate.part_number_id)
      const named = names
        .filter((row) => row.part_number_id === candidate.part_number_id)
        .sort((a, b) => a.name.length - b.name.length)[0]

      candidate.product_id = linked?.product_variant?.product_id ?? null
      candidate.title = candidate.title ?? named?.value ?? null
    }
  }

  return res.status(200).json({ candidates: [...candidates.values()] })
}

export async function POST(
  req: AuthenticatedMedusaRequest<CreateProductDraftBody>,
  res: MedusaResponse
) {
  const body = req.validatedBody
  const { result } = await createProductByNumberWorkflow(req.scope).run({
    input: {
      brand: body.brand,
      number: body.number,
      number_type: body.number_type,
      title: body.title,
      purchase_price_minor: Math.round(body.purchase_price * 100),
      quantity: body.quantity,
    },
  })

  return res.status(200).json({ product: result })
}
