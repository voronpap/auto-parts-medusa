import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import {
  batchInventoryItemLevelsWorkflow,
  updateProductVariantsWorkflow,
} from "@medusajs/medusa/core-flows"
import productVariantPartNumber from "../../../links/product-variant-part-number"
import { normalizeBrandName } from "../../../modules/parts-catalog/utils/normalize"
import { SUPPLY_MODULE } from "../../../modules/supply"
import SupplyModuleService from "../../../modules/supply/service"
import { markupFor, shopPriceMinor } from "../../../modules/supply/utils/markup"

// Variants read and written in one go during a recalculation.
const PAGE = 500

const resolveSupply = (container: { resolve: <T>(key: string) => T }) =>
  container.resolve<SupplyModuleService>(SUPPLY_MODULE)

async function settingsOf(supply: SupplyModuleService) {
  const [settings] = await supply.listPricingSettings({}, { take: 1 })

  return settings ?? (await supply.createPricingSettings({}))
}

export type UpdatePricingSettingsInput = {
  default_markup_percent?: number | null
  rounding_step?: number
  sync_stock?: boolean
}

type SettingsSnapshot = {
  id: string
  default_markup_bp: number | null
  rounding_minor: number
  sync_stock: boolean
}

export const updatePricingSettingsStep = createStep(
  "update-supply-pricing-settings",
  async (input: UpdatePricingSettingsInput, { container }) => {
    const supply = resolveSupply(container)
    const current = await settingsOf(supply)
    const snapshot: SettingsSnapshot = {
      id: current.id,
      default_markup_bp: current.default_markup_bp,
      rounding_minor: current.rounding_minor,
      sync_stock: current.sync_stock,
    }
    const updated = await supply.updatePricingSettings({
      id: current.id,
      ...(input.default_markup_percent !== undefined
        ? {
            default_markup_bp:
              input.default_markup_percent == null
                ? null
                : Math.round(input.default_markup_percent * 100),
          }
        : {}),
      ...(input.rounding_step !== undefined
        ? { rounding_minor: Math.round(input.rounding_step * 100) }
        : {}),
      ...(input.sync_stock !== undefined ? { sync_stock: input.sync_stock } : {}),
    })

    return new StepResponse(updated, snapshot)
  },
  async (snapshot: SettingsSnapshot | undefined, { container }) => {
    if (snapshot) {
      await resolveSupply(container).updatePricingSettings(snapshot)
    }
  }
)

export type CreatePricingRuleInput = {
  brand?: string | null
  price_from?: number | null
  price_to?: number | null
  markup_percent: number
}

export const createPricingRuleStep = createStep(
  "create-supply-pricing-rule",
  async (input: CreatePricingRuleInput, { container }) => {
    const supply = resolveSupply(container)
    const brand = input.brand?.trim() || null
    const from = input.price_from != null ? Math.round(input.price_from * 100) : null
    const to = input.price_to != null ? Math.round(input.price_to * 100) : null

    if (!brand && from == null && to == null) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "A rule needs a brand or a price range; the markup for everything else is the default one"
      )
    }

    if (from != null && to != null && to <= from) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "The upper price must be greater than the lower one"
      )
    }

    const rule = await supply.createPricingRules({
      brand,
      normalized_brand: brand ? normalizeBrandName(brand) : null,
      price_from_minor: from,
      price_to_minor: to,
      markup_bp: Math.round(input.markup_percent * 100),
    })

    return new StepResponse(rule, rule.id)
  },
  async (ruleId: string | undefined, { container }) => {
    if (ruleId) {
      await resolveSupply(container).deletePricingRules(ruleId)
    }
  }
)

export const deletePricingRuleStep = createStep(
  "delete-supply-pricing-rule",
  async ({ id }: { id: string }, { container }) => {
    await resolveSupply(container).softDeletePricingRules(id)

    return new StepResponse({ id }, id)
  },
  async (id: string | undefined, { container }) => {
    if (id) {
      await resolveSupply(container).restorePricingRules(id)
    }
  }
)

type AppliedUndo = {
  prices: { id: string; amount: number; currency_code: string }[]
  levels: { inventory_item_id: string; location_id: string; stocked_quantity: number }[]
  created_levels: { inventory_item_id: string; location_id: string }[]
  settings: { id: string; last_applied_at: Date | null; last_result: Record<string, unknown> | null }
}

type VariantRow = {
  id: string
  metadata?: Record<string, unknown> | null
  manage_inventory?: boolean | null
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

/**
 * Gives every product that a supplier offers its shop price and, when stock
 * is synchronised, its availability. For a product several suppliers offer,
 * the cheapest offer that is in stock is taken; a product nobody offers any
 * more is left with its price and gets zero stock.
 */
export const applyOffersToProductsStep = createStep(
  "apply-supply-offers-to-products",
  async (_: Record<string, never>, { container }) => {
    const supply = resolveSupply(container)
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const settings = await settingsOf(supply)
    const rules = await supply.listPricingRules({}, { take: null })
    const hasMarkup =
      settings.default_markup_bp != null || rules.some((rule) => !rule.normalized_brand)

    if (!hasMarkup && !rules.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Set the markup first: prices are not calculated without one"
      )
    }

    const { data: locations } = await query.graph({
      entity: "stock_location",
      fields: ["id"],
    })
    const locationId = locations[0]?.id as string | undefined
    const undo: AppliedUndo = {
      prices: [],
      levels: [],
      created_levels: [],
      settings: {
        id: settings.id,
        last_applied_at: settings.last_applied_at,
        last_result: settings.last_result,
      },
    }
    const result = {
      products_with_offer: 0,
      prices_changed: 0,
      stock_changed: 0,
      without_offer: 0,
      without_markup: 0,
    }

    // Variants are read a page at a time: the shop may hold a whole price
    // list, which does not fit in memory at once.
    for (let skip = 0; ; skip += PAGE) {
      const { data: variants } = await query.graph({
        entity: "product_variant",
        fields: [
          "id",
          "metadata",
          "manage_inventory",
          "prices.amount",
          "prices.currency_code",
          "inventory_items.inventory_item_id",
          "inventory_items.inventory.location_levels.location_id",
          "inventory_items.inventory.location_levels.stocked_quantity",
        ],
        pagination: { skip, take: PAGE, order: { id: "ASC" } },
      })

      if (!variants.length) {
        break
      }

      const { data: links } = await query.graph({
        entity: productVariantPartNumber.entryPoint,
        fields: ["product_variant_id", "part_number_id"],
        filters: { product_variant_id: variants.map((variant) => variant.id) },
      })
      const numbersOf = new Map<string, string[]>()

      for (const link of links) {
        numbersOf.set(link.product_variant_id, [
          ...(numbersOf.get(link.product_variant_id) ?? []),
          link.part_number_id,
        ])
      }

      const numberIds = [...new Set(links.map((link) => link.part_number_id))]
      const offers = numberIds.length
        ? await supply.listSupplierOffers(
            { part_number_id: numberIds, is_listed: true },
            {
              select: [
                "id",
                "part_number_id",
                "normalized_brand",
                "price_minor",
                "currency_code",
                "stock_quantity",
              ],
              take: null,
            }
          )
        : []
      // The cheapest offer in stock; failing that, the cheapest offer.
      const best = new Map<string, (typeof offers)[number]>()

      for (const offer of offers) {
        const known = best.get(offer.part_number_id!)
        const inStock = (offer.stock_quantity ?? 0) > 0
        const knownInStock = known ? (known.stock_quantity ?? 0) > 0 : false

        if (
          !known ||
          (inStock && !knownInStock) ||
          (inStock === knownInStock && offer.price_minor < known.price_minor)
        ) {
          best.set(offer.part_number_id!, offer)
        }
      }

      const priceUpdates: { id: string; prices: { amount: number; currency_code: string }[] }[] = []
      const levelCreates: { inventory_item_id: string; location_id: string; stocked_quantity: number }[] = []
      const levelUpdates: { inventory_item_id: string; location_id: string; stocked_quantity: number }[] = []

      for (const variant of variants as VariantRow[]) {
        const purchase = Number(variant.metadata?.purchase_price_minor)

        // The owner typed the purchase price of this product: it is priced
        // from that, and neither price nor stock follows a supplier.
        if (Number.isFinite(purchase) && purchase > 0) {
          const markup = markupFor(
            rules,
            settings.default_markup_bp,
            String(variant.metadata?.purchase_brand ?? ""),
            purchase
          )

          if (markup == null) {
            result.without_markup += 1
            continue
          }

          const amount = shopPriceMinor(purchase, markup, settings.rounding_minor) / 100
          const current = (variant.prices ?? []).find(
            (price) => price.currency_code === "uah"
          )

          if (!current || Number(current.amount) !== amount) {
            if (current) {
              undo.prices.push({
                id: variant.id,
                amount: Number(current.amount),
                currency_code: current.currency_code,
              })
            }

            priceUpdates.push({
              id: variant.id,
              prices: [{ amount, currency_code: "uah" }],
            })
            result.prices_changed += 1
          }

          continue
        }

        // A variant the parts catalog does not know is priced by hand.
        if (!numbersOf.has(variant.id)) {
          continue
        }

        const offer = numbersOf
          .get(variant.id)!
          .map((numberId) => best.get(numberId))
          .filter((item): item is (typeof offers)[number] => Boolean(item))
          .sort((a, b) => a.price_minor - b.price_minor)[0]
        let stock = 0

        if (offer) {
          result.products_with_offer += 1
          const markup = markupFor(
            rules,
            settings.default_markup_bp,
            offer.normalized_brand,
            offer.price_minor
          )

          if (markup == null) {
            result.without_markup += 1
          } else {
            const amount =
              shopPriceMinor(offer.price_minor, markup, settings.rounding_minor) / 100
            const current = (variant.prices ?? []).find(
              (price) => price.currency_code === offer.currency_code
            )

            if (!current || Number(current.amount) !== amount) {
              if (current) {
                undo.prices.push({
                  id: variant.id,
                  amount: Number(current.amount),
                  currency_code: current.currency_code,
                })
              }

              priceUpdates.push({
                id: variant.id,
                prices: [{ amount, currency_code: offer.currency_code }],
              })
              result.prices_changed += 1
            }

            stock = offer.stock_quantity ?? 0
          }
        } else {
          result.without_offer += 1
        }

        const item = variant.inventory_items?.[0]

        if (!settings.sync_stock || !variant.manage_inventory || !item || !locationId) {
          continue
        }

        const level = item.inventory?.location_levels?.find(
          (row) => row.location_id === locationId
        )

        if (!level) {
          if (stock > 0) {
            levelCreates.push({
              inventory_item_id: item.inventory_item_id,
              location_id: locationId,
              stocked_quantity: stock,
            })
            undo.created_levels.push({
              inventory_item_id: item.inventory_item_id,
              location_id: locationId,
            })
            result.stock_changed += 1
          }
        } else if (Number(level.stocked_quantity) !== stock) {
          undo.levels.push({
            inventory_item_id: item.inventory_item_id,
            location_id: locationId,
            stocked_quantity: Number(level.stocked_quantity),
          })
          levelUpdates.push({
            inventory_item_id: item.inventory_item_id,
            location_id: locationId,
            stocked_quantity: stock,
          })
          result.stock_changed += 1
        }
      }

      if (priceUpdates.length) {
        await updateProductVariantsWorkflow(container).run({
          input: { product_variants: priceUpdates },
        })
      }

      if (levelCreates.length || levelUpdates.length) {
        await batchInventoryItemLevelsWorkflow(container).run({
          input: { create: levelCreates, update: levelUpdates, delete: [] },
        })
      }

      if (variants.length < PAGE) {
        break
      }
    }

    await supply.updatePricingSettings({
      id: settings.id,
      last_applied_at: new Date(),
      last_result: result,
    })

    return new StepResponse(result, undo)
  },
  async (undo: AppliedUndo | undefined, { container }) => {
    if (!undo) {
      return
    }

    if (undo.prices.length) {
      await updateProductVariantsWorkflow(container).run({
        input: {
          product_variants: undo.prices.map((price) => ({
            id: price.id,
            prices: [{ amount: price.amount, currency_code: price.currency_code }],
          })),
        },
      })
    }

    if (undo.levels.length || undo.created_levels.length) {
      await batchInventoryItemLevelsWorkflow(container).run({
        input: {
          create: [],
          update: [
            ...undo.levels,
            ...undo.created_levels.map((level) => ({ ...level, stocked_quantity: 0 })),
          ],
          delete: [],
        },
      })
    }

    await resolveSupply(container).updatePricingSettings(undo.settings)
  }
)
