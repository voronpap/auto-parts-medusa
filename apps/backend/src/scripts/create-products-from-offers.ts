/**
 * Creates shop products from a supplier's price list.
 *
 *   SUPPLIER="Автотехнікс" pnpm exec medusa exec ./src/scripts/create-products-from-offers.ts
 *
 * Optional: LIMIT=5000 stops after that many offers; BRANDS="KYB,BOSCH"
 * takes only these brands. Offers that are in stock are taken; an offer
 * whose number already has a product is skipped, so the script can be
 * stopped and started again.
 */
import type { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { createProductCategoriesWorkflow } from "@medusajs/medusa/core-flows"
import { normalizeBrandName } from "../modules/parts-catalog/utils/normalize"
import { SUPPLY_MODULE } from "../modules/supply"
import SupplyModuleService from "../modules/supply/service"
import { ALL_CATEGORIES } from "../modules/supply/utils/categorize"
import { createProductsFromSupplyOffersWorkflow } from "../workflows/supply"

const BATCH = 40
const PAGE = 2000

export default async function createProductsFromOffers({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const supply = container.resolve<SupplyModuleService>(SUPPLY_MODULE)
  const name = process.env.SUPPLIER
  const limit = Number.parseInt(process.env.LIMIT ?? "", 10) || Infinity
  const brands = (process.env.BRANDS ?? "")
    .split(",")
    .map((brand) => normalizeBrandName(brand))
    .filter(Boolean)
  const [supplier] = name
    ? await supply.listSuppliers({ normalized_name: normalizeBrandName(name) })
    : []

  if (!supplier) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Supplier "${name}" was not found; set SUPPLIER`)
  }

  const { data: salesChannels } = await query.graph({ entity: "sales_channel", fields: ["id"] })
  const { data: shippingProfiles } = await query.graph({ entity: "shipping_profile", fields: ["id"] })
  const { data: locations } = await query.graph({ entity: "stock_location", fields: ["id"] })
  const { data: existing } = await query.graph({ entity: "product_category", fields: ["id", "name"] })
  const missing = ALL_CATEGORIES.filter(
    (category) => !existing.some((item) => item.name === category.name)
  )

  if (missing.length) {
    await createProductCategoriesWorkflow(container).run({
      input: {
        product_categories: missing.map((category) => ({ ...category, is_active: true })),
      },
    })
    logger.info(`Created ${missing.length} categories`)
  }

  const { data: all } = await query.graph({ entity: "product_category", fields: ["id", "name"] })
  const categories = Object.fromEntries(all.map((category) => [category.name, category.id as string]))
  const totals = { offers: 0, created: 0, existing: 0, without_markup: 0, skipped: 0, failed: 0 }
  const started = Date.now()
  let lastId = ""

  while (totals.offers < limit) {
    // Pages follow the id, so offers that change during the run are not
    // skipped or repeated.
    const page = await supply.listSupplierOffers(
      {
        supplier_id: supplier.id,
        is_listed: true,
        stock_quantity: { $gt: 0 },
        ...(brands.length ? { normalized_brand: brands } : {}),
        ...(lastId ? { id: { $gt: lastId } } : {}),
      },
      { select: ["id"], order: { id: "ASC" }, take: Math.min(PAGE, limit - totals.offers) }
    )

    if (!page.length) {
      break
    }

    lastId = page[page.length - 1].id

    for (let start = 0; start < page.length; start += BATCH) {
      const ids = page.slice(start, start + BATCH).map((offer) => offer.id)

      try {
        const { result } = await createProductsFromSupplyOffersWorkflow(container).run({
          input: {
            offer_ids: ids,
            categories,
            sales_channel_id: salesChannels[0].id,
            shipping_profile_id: shippingProfiles[0].id,
            location_id: (locations[0]?.id as string) ?? null,
          },
        })
        totals.created += result.created
        totals.existing += result.existing
        totals.without_markup += result.without_markup
        totals.skipped += result.skipped
      } catch (error) {
        totals.failed += ids.length
        logger.error(
          `Batch after ${totals.offers} offers failed: ${error instanceof Error ? error.message : String(error)}`
        )
      }

      totals.offers += ids.length
    }

    const seconds = Math.round((Date.now() - started) / 1000)
    logger.info(`Progress ${JSON.stringify(totals)} in ${seconds}s`)
  }

  logger.info(`Done ${JSON.stringify(totals)}`)
}
