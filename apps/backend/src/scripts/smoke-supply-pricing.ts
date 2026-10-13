/**
 * Checks that supplier offers reach product prices and stock, using a
 * temporary markup, and then puts prices, stock and settings back exactly as
 * they were. Meant for verification after a change to the pricing code.
 *
 *   pnpm exec medusa exec ./src/scripts/smoke-supply-pricing.ts
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  batchInventoryItemLevelsWorkflow,
  updateProductVariantsWorkflow,
} from "@medusajs/medusa/core-flows"
import { SUPPLY_MODULE } from "../modules/supply"
import SupplyModuleService from "../modules/supply/service"
import {
  applySupplyOffersToProductsWorkflow,
  createSupplyPricingRuleWorkflow,
  updateSupplyPricingSettingsWorkflow,
} from "../workflows/supply"

const check = (condition: unknown, message: string) => {
  if (!condition) {
    throw new Error(`FAILED: ${message}`)
  }
}

type Variant = {
  id: string
  sku?: string | null
  prices?: { amount: number; currency_code: string }[] | null
  inventory_items?:
    | {
        inventory_item_id: string
        inventory?: {
          location_levels?: { location_id: string; stocked_quantity: number }[] | null
        } | null
      }[]
    | null
}

export default async function smokeSupplyPricing({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const supply = container.resolve<SupplyModuleService>(SUPPLY_MODULE)
  const read = async () =>
    (
      await query.graph({
        entity: "product_variant",
        fields: [
          "id",
          "sku",
          "prices.amount",
          "prices.currency_code",
          "inventory_items.inventory_item_id",
          "inventory_items.inventory.location_levels.location_id",
          "inventory_items.inventory.location_levels.stocked_quantity",
        ],
      })
    ).data as Variant[]
  const before = await read()
  const [settingsBefore] = await supply.listPricingSettings({}, { take: 1 })
  const rulesBefore = await supply.listPricingRules({}, { take: null })
  let ruleId: string | undefined

  try {
    await updateSupplyPricingSettingsWorkflow(container).run({
      input: { default_markup_percent: 25, rounding_step: 1, sync_stock: true },
    })
    const { result: rule } = await createSupplyPricingRuleWorkflow(container).run({
      input: { brand: "KYB", markup_percent: 10 },
    })
    ruleId = rule.id
    const { result } = await applySupplyOffersToProductsWorkflow(container).run()
    logger.info(`Applied: ${JSON.stringify(result)}`)
    check(result.products_with_offer > 0, "some products have a supplier offer")

    const after = await read()
    const offers = await supply.listSupplierOffers(
      { is_listed: true, normalized_number: ["0451103314", "3358015"] },
      { take: 10 }
    )
    const bosch = offers.find((offer) => offer.normalized_number === "0451103314")
    const kyb = offers.find((offer) => offer.normalized_number === "3358015")
    const price = (sku: string) =>
      Number(
        after.find((variant) => variant.sku === sku)?.prices?.find((p) => p.currency_code === "uah")
          ?.amount
      )
    const stock = (sku: string) =>
      Number(
        after.find((variant) => variant.sku === sku)?.inventory_items?.[0]?.inventory
          ?.location_levels?.[0]?.stocked_quantity ?? 0
      )

    if (bosch) {
      const expected = Math.ceil((bosch.price_minor * 1.25) / 100)
      check(price("0 451 103 314") === expected, `Bosch is priced ${expected}, got ${price("0 451 103 314")}`)
      check(stock("0 451 103 314") === (bosch.stock_quantity ?? 0), "Bosch stock follows the supplier")
    }

    if (kyb) {
      const expected = Math.ceil((kyb.price_minor * 1.1) / 100)
      check(price("3358015") === expected, `KYB uses its brand rule: ${expected}, got ${price("3358015")}`)
    }

    const again = await applySupplyOffersToProductsWorkflow(container).run()
    check(
      again.result.prices_changed === 0 && again.result.stock_changed === 0,
      "a second run changes nothing"
    )
    logger.info("Supply pricing smoke test passed")
  } finally {
    // Back to exactly what was there before.
    const now = await read()
    const prices = now.flatMap((variant) => {
      const old = before.find((item) => item.id === variant.id)?.prices ?? []
      const same =
        JSON.stringify(old.map((p) => [p.currency_code, Number(p.amount)]).sort()) ===
        JSON.stringify((variant.prices ?? []).map((p) => [p.currency_code, Number(p.amount)]).sort())

      return same
        ? []
        : [{ id: variant.id, prices: old.map((p) => ({ amount: Number(p.amount), currency_code: p.currency_code })) }]
    })

    if (prices.length) {
      await updateProductVariantsWorkflow(container).run({ input: { product_variants: prices } })
    }

    const update: { inventory_item_id: string; location_id: string; stocked_quantity: number }[] = []
    const remove: string[] = []

    for (const variant of now) {
      const item = variant.inventory_items?.[0]
      const oldLevels =
        before.find((entry) => entry.id === variant.id)?.inventory_items?.[0]?.inventory
          ?.location_levels ?? []

      for (const level of item?.inventory?.location_levels ?? []) {
        const old = oldLevels.find((entry) => entry.location_id === level.location_id)

        if (!old) {
          update.push({ inventory_item_id: item!.inventory_item_id, location_id: level.location_id, stocked_quantity: 0 })
        } else if (Number(old.stocked_quantity) !== Number(level.stocked_quantity)) {
          update.push({
            inventory_item_id: item!.inventory_item_id,
            location_id: level.location_id,
            stocked_quantity: Number(old.stocked_quantity),
          })
        }
      }
    }

    if (update.length) {
      await batchInventoryItemLevelsWorkflow(container).run({
        input: { create: [], update, delete: remove },
      })
    }

    if (ruleId && !rulesBefore.some((rule) => rule.id === ruleId)) {
      await supply.deletePricingRules(ruleId)
    }

    const [settingsNow] = await supply.listPricingSettings({}, { take: 1 })

    if (settingsNow) {
      await supply.updatePricingSettings({
        id: settingsNow.id,
        default_markup_bp: settingsBefore?.default_markup_bp ?? null,
        rounding_minor: settingsBefore?.rounding_minor ?? 100,
        sync_stock: settingsBefore?.sync_stock ?? true,
        last_applied_at: settingsBefore?.last_applied_at ?? null,
        last_result: settingsBefore?.last_result ?? null,
      })
    }

    logger.info(`Restored: ${prices.length} prices, ${update.length} stock levels`)
  }
}
