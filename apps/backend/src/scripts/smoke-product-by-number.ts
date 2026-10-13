/**
 * Checks "product by number" end to end on a throwaway brand, then removes
 * everything it created.
 *
 *   pnpm exec medusa exec ./src/scripts/smoke-product-by-number.ts
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { deleteProductsWorkflow } from "@medusajs/medusa/core-flows"
import productVariantPartNumber from "../links/product-variant-part-number"
import { PARTS_CATALOG_MODULE } from "../modules/parts-catalog"
import PartsCatalogModuleService from "../modules/parts-catalog/service"
import { SUPPLY_MODULE } from "../modules/supply"
import SupplyModuleService from "../modules/supply/service"
import { markupFor, shopPriceMinor } from "../modules/supply/utils/markup"
import { createProductByNumberWorkflow } from "../workflows/supply"

const check = (condition: unknown, message: string) => {
  if (!condition) {
    throw new Error(`FAILED: ${message}`)
  }
}

export default async function smokeProductByNumber({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const catalog = container.resolve<PartsCatalogModuleService>(PARTS_CATALOG_MODULE)
  const supply = container.resolve<SupplyModuleService>(SUPPLY_MODULE)
  const tag = `ZZSMOKE${Date.now().toString(36).toUpperCase()}`
  const input = {
    brand: `${tag} Brand`,
    number: `${tag}-1`,
    number_type: "aftermarket" as const,
    title: "Фільтр масляний",
    purchase_price_minor: 12_345,
    quantity: 3,
  }
  const { result } = await createProductByNumberWorkflow(container).run({ input })

  try {
    const [settings] = await supply.listPricingSettings({}, { take: 1 })
    const rules = await supply.listPricingRules({}, { take: null })
    const markup = markupFor(rules, settings.default_markup_bp, "", input.purchase_price_minor)!
    const expected = shopPriceMinor(input.purchase_price_minor, markup, settings.rounding_minor) / 100
    const { data: products } = await query.graph({
      entity: "product",
      fields: [
        "title",
        "status",
        "categories.name",
        "variants.sku",
        "variants.metadata",
        "variants.prices.amount",
        "variants.inventory_items.inventory.location_levels.stocked_quantity",
      ],
      filters: { id: result.product_id },
    })
    const product = products[0]
    const variant = product.variants[0] as unknown as {
      metadata?: Record<string, unknown> | null
      prices?: { amount: number }[]
      inventory_items?: {
        inventory?: { location_levels?: { stocked_quantity: number }[] }
      }[]
    }

    check(result.price === expected, `price ${result.price}, expected ${expected}`)
    check(Number(variant.prices?.[0]?.amount) === expected, "variant price")
    check(product.status === "published", "published")
    check(product.categories?.[0]?.name === "Масляні фільтри", "category by title")
    check(variant.metadata?.purchase_price_minor === 12_345, "purchase price kept")
    check(
      Number(variant.inventory_items?.[0]?.inventory?.location_levels?.[0]?.stocked_quantity) === 3,
      "stock"
    )

    // The query the search route uses to tell that a number has a product.
    const { data: links } = await query.graph({
      entity: productVariantPartNumber.entryPoint,
      fields: ["part_number_id", "product_variant.product_id"],
      filters: { part_number_id: [result.part_number_id] },
    })
    check(links[0]?.product_variant?.product_id === result.product_id, "link to product")

    const tasks = await catalog.listLookupTasks({ part_number_id: result.part_number_id })
    check(tasks.length === 1 && tasks[0].status !== "failed", "lookup queued")

    const again = await createProductByNumberWorkflow(container)
      .run({ input, throwOnError: false })
    check(again.errors?.length, "second product for the number is refused")
    logger.info(`OK ${JSON.stringify({ title: product.title, price: result.price, markup })}`)
  } finally {
    const number = await catalog.retrievePartNumber(result.part_number_id)

    await deleteProductsWorkflow(container).run({ input: { ids: [result.product_id] } })
    await catalog.deletePartNumbers(result.part_number_id)
    await catalog.deleteBrands(number.brand_id)
    logger.info("Cleaned up")
  }
}
