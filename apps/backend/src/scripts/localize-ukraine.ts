/**
 * One-off store setup: replaces the European demo configuration created by the
 * starter seed with settings for Ukraine (tax region, delivery, reasons) and
 * removes the starter's demo catalog.
 *
 *   DRY_RUN=1 pnpm exec medusa exec ./src/scripts/localize-ukraine.ts
 *   pnpm exec medusa exec ./src/scripts/localize-ukraine.ts
 *
 * Every step checks the current state first, so re-running it is a no-op.
 */
import type { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import {
  createLocationFulfillmentSetWorkflow,
  createReturnReasonsWorkflow,
  createServiceZonesWorkflow,
  createShippingOptionsWorkflow,
  createTaxRatesWorkflow,
  createTaxRegionsWorkflow,
  deleteFulfillmentSetsWorkflow,
  deletePricePreferencesWorkflow,
  deleteProductCategoriesWorkflow,
  deleteProductsWorkflow,
  deleteShippingOptionsWorkflow,
  deleteTaxRegionsWorkflow,
  updateApiKeysWorkflow,
  updateRefundReasonsWorkflow,
  updateRegionsWorkflow,
  updateShippingProfilesWorkflow,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows"

const COUNTRY_CODE = "ua"
const CURRENCY_CODE = "uah"

const DEMO_PRODUCT_HANDLES = ["t-shirt", "sweatshirt", "sweatpants", "shorts"]
const DEMO_CATEGORY_NAMES = ["Shirts", "Sweatshirts", "Pants", "Merch"]
const DEMO_SHIPPING_OPTION_NAMES = ["Standard Shipping", "Express Shipping"]
const DEMO_FULFILLMENT_SET_NAME = "European Warehouse delivery"

const SHIPPING_SET_NAME = "Доставка по Україні"
const PICKUP_SET_NAME = "Самовивіз"
// Service zone names must be unique across fulfillment sets.
const SERVICE_ZONE_NAMES: Record<string, string> = {
  [SHIPPING_SET_NAME]: "Україна",
  [PICKUP_SET_NAME]: "Самовивіз, Україна",
}
const SHIPPING_PROFILE_NAME = "Стандартний профіль доставки"
const API_KEY_TITLE = "Публічний ключ магазину"

// Carrier integrations are not connected yet, so delivery is charged by the
// carrier on receipt and the order itself carries no delivery amount.
const CARRIER_PRICE_NOTE =
  "Вартість за тарифами перевізника, оплата при отриманні."

const SHIPPING_OPTIONS = [
  {
    name: "Нова Пошта — відділення або поштомат",
    label: "Нова Пошта, відділення",
    code: "nova-poshta-warehouse",
    description: CARRIER_PRICE_NOTE,
  },
  {
    name: "Нова Пошта — кур'єр",
    label: "Нова Пошта, кур'єр",
    code: "nova-poshta-courier",
    description: CARRIER_PRICE_NOTE,
  },
  {
    name: "Укрпошта — відділення",
    label: "Укрпошта",
    code: "ukrposhta-warehouse",
    description: CARRIER_PRICE_NOTE,
  },
]

const PICKUP_OPTION = {
  name: "Самовивіз зі складу",
  label: "Самовивіз",
  code: "pickup",
  description: "Безкоштовно, за попередньою домовленістю.",
}

const TAX_RATES = {
  noVat: { name: "Без ПДВ", code: "no-vat", rate: 0 },
  vat: { name: "ПДВ 20%", code: "vat-20", rate: 20 },
}

const RETURN_REASONS = [
  { value: "defective", label: "Брак або дефект" },
  { value: "wrong_item", label: "Надіслано не той товар" },
  { value: "does_not_fit", label: "Не підійшло до автомобіля" },
  { value: "damaged_in_transit", label: "Пошкоджено під час доставки" },
  { value: "changed_mind", label: "Покупець передумав" },
  { value: "other", label: "Інша причина" },
]

const REFUND_REASON_LABELS: Record<string, string> = {
  shipping_issue: "Проблема з доставкою",
  customer_care_adjustment: "Коригування службою підтримки",
  pricing_error: "Помилка в ціні",
}

const SHIPPING_OPTION_RULES = [
  { attribute: "enabled_in_store", value: "true", operator: "eq" as const },
  { attribute: "is_return", value: "false", operator: "eq" as const },
]

export default async function localizeUkraine({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const dryRun = process.env.DRY_RUN === "1"

  const step = async (title: string, run: () => Promise<unknown>) => {
    if (dryRun) {
      logger.info(`[dry-run] ${title}`)
      return
    }

    logger.info(title)
    await run()
  }

  const { data: stores } = await query.graph({
    entity: "store",
    fields: ["id", "default_region_id", "default_location_id"],
  })
  const store = stores[0]
  const regionId = store?.default_region_id
  const locationId = store?.default_location_id

  if (!store || !regionId || !locationId) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "Store, default region or default location is missing"
    )
  }

  // 1. Demo catalog
  const { data: demoProducts } = await query.graph({
    entity: "product",
    fields: ["id", "handle"],
    filters: { handle: DEMO_PRODUCT_HANDLES },
  })

  if (demoProducts.length) {
    await step(`Deleting ${demoProducts.length} demo products`, () =>
      deleteProductsWorkflow(container).run({
        input: { ids: demoProducts.map((product) => product.id) },
      })
    )
  }

  const { data: demoCategories } = await query.graph({
    entity: "product_category",
    fields: ["id", "name"],
    filters: { name: DEMO_CATEGORY_NAMES },
  })

  if (demoCategories.length) {
    await step(`Deleting ${demoCategories.length} demo categories`, () =>
      deleteProductCategoriesWorkflow(container).run({
        input: demoCategories.map((category) => category.id),
      })
    )
  }

  // 2. Delivery
  const { data: demoShippingOptions } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "name"],
    filters: { name: DEMO_SHIPPING_OPTION_NAMES },
  })

  if (demoShippingOptions.length) {
    await step(
      `Deleting ${demoShippingOptions.length} demo shipping options`,
      () =>
        deleteShippingOptionsWorkflow(container).run({
          input: { ids: demoShippingOptions.map((option) => option.id) },
        })
    )
  }

  const listFulfillmentSets = async () => {
    const { data } = await query.graph({
      entity: "fulfillment_set",
      fields: ["id", "name", "type", "service_zones.id", "service_zones.name"],
    })

    return data
  }

  let fulfillmentSets = await listFulfillmentSets()
  const demoSet = fulfillmentSets.find(
    (set) => set.name === DEMO_FULFILLMENT_SET_NAME
  )

  if (demoSet) {
    await step(`Deleting fulfillment set "${demoSet.name}"`, () =>
      deleteFulfillmentSetsWorkflow(container).run({
        input: { ids: [demoSet.id] },
      })
    )
  }

  for (const [name, type] of [
    [SHIPPING_SET_NAME, "shipping"],
    [PICKUP_SET_NAME, "pickup"],
  ]) {
    if (!fulfillmentSets.some((set) => set.name === name)) {
      await step(`Creating fulfillment set "${name}"`, () =>
        createLocationFulfillmentSetWorkflow(container).run({
          input: {
            location_id: locationId,
            fulfillment_set_data: { name, type },
          },
        })
      )
    }
  }

  fulfillmentSets = await listFulfillmentSets()

  for (const name of [SHIPPING_SET_NAME, PICKUP_SET_NAME]) {
    const set = fulfillmentSets.find((item) => item.name === name)

    if (set && !set.service_zones?.length) {
      await step(`Creating service zone for "${name}"`, () =>
        createServiceZonesWorkflow(container).run({
          input: {
            data: [
              {
                name: SERVICE_ZONE_NAMES[name],
                fulfillment_set_id: set.id,
                geo_zones: [{ type: "country", country_code: COUNTRY_CODE }],
              },
            ],
          },
        })
      )
    }
  }

  fulfillmentSets = await listFulfillmentSets()

  const { data: shippingProfiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id", "name", "type"],
  })
  const defaultProfile =
    shippingProfiles.find((profile) => profile.type === "default") ??
    shippingProfiles[0]

  if (defaultProfile && defaultProfile.name !== SHIPPING_PROFILE_NAME) {
    await step("Renaming the default shipping profile", () =>
      updateShippingProfilesWorkflow(container).run({
        input: {
          selector: { id: defaultProfile.id },
          update: { name: SHIPPING_PROFILE_NAME },
        },
      })
    )
  }

  const { data: existingOptions } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "name"],
  })
  const existingOptionNames = new Set(
    existingOptions.map((option) => option.name)
  )
  const zoneIdOf = (setName: string) =>
    fulfillmentSets.find((set) => set.name === setName)?.service_zones?.[0]?.id
  const shippingZoneId = zoneIdOf(SHIPPING_SET_NAME)
  const pickupZoneId = zoneIdOf(PICKUP_SET_NAME)
  const optionsToCreate = [
    ...SHIPPING_OPTIONS.map((option) => ({ option, zoneId: shippingZoneId })),
    { option: PICKUP_OPTION, zoneId: pickupZoneId },
  ].filter(({ option }) => !existingOptionNames.has(option.name))

  if (optionsToCreate.length) {
    if (!dryRun && (!defaultProfile || !shippingZoneId || !pickupZoneId)) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Shipping profile or service zone is missing"
      )
    }

    await step(`Creating ${optionsToCreate.length} shipping options`, () =>
      createShippingOptionsWorkflow(container).run({
        input: optionsToCreate.map(({ option, zoneId }) => ({
          name: option.name,
          price_type: "flat" as const,
          provider_id: "manual_manual",
          service_zone_id: zoneId as string,
          shipping_profile_id: defaultProfile.id,
          type: {
            label: option.label,
            description: option.description,
            code: option.code,
          },
          prices: [
            { currency_code: CURRENCY_CODE, amount: 0 },
            { region_id: regionId, amount: 0 },
          ],
          rules: SHIPPING_OPTION_RULES,
        })),
      })
    )
  }

  // 3. Taxes
  const { data: taxRegions } = await query.graph({
    entity: "tax_region",
    fields: ["id", "country_code", "tax_rates.id", "tax_rates.code"],
  })
  const foreignTaxRegions = taxRegions.filter(
    (region) => region.country_code !== COUNTRY_CODE
  )

  if (foreignTaxRegions.length) {
    await step(
      `Deleting ${foreignTaxRegions.length} tax regions outside Ukraine`,
      () =>
        deleteTaxRegionsWorkflow(container).run({
          input: { ids: foreignTaxRegions.map((region) => region.id) },
        })
    )
  }

  let taxRegion = taxRegions.find(
    (region) => region.country_code === COUNTRY_CODE
  )

  if (!taxRegion) {
    await step("Creating the tax region for Ukraine (default: no VAT)", () =>
      createTaxRegionsWorkflow(container).run({
        input: [
          {
            country_code: COUNTRY_CODE,
            provider_id: "tp_system",
            default_tax_rate: TAX_RATES.noVat,
          },
        ],
      })
    )

    const { data } = await query.graph({
      entity: "tax_region",
      fields: ["id", "country_code", "tax_rates.id", "tax_rates.code"],
      filters: { country_code: COUNTRY_CODE },
    })
    taxRegion = data[0]
  }

  const ukraineTaxRegion = taxRegion

  if (
    ukraineTaxRegion &&
    !ukraineTaxRegion.tax_rates?.some(
      (rate) => rate?.code === TAX_RATES.vat.code
    )
  ) {
    await step("Creating the optional 20% VAT rate", () =>
      createTaxRatesWorkflow(container).run({
        input: [
          {
            tax_region_id: ukraineTaxRegion.id,
            ...TAX_RATES.vat,
            is_default: false,
          },
        ],
      })
    )
  }

  // 4. Prices are entered tax inclusive, the norm for retail in Ukraine.
  await step("Marking UAH and the region as tax inclusive", async () => {
    await updateStoresWorkflow(container).run({
      input: {
        selector: { id: store.id },
        update: {
          supported_currencies: [
            {
              currency_code: CURRENCY_CODE,
              is_default: true,
              is_tax_inclusive: true,
            },
          ],
        },
      },
    })
    await updateRegionsWorkflow(container).run({
      input: {
        selector: { id: regionId },
        update: { is_tax_inclusive: true },
      },
    })
  })

  const { data: pricePreferences } = await query.graph({
    entity: "price_preference",
    fields: ["id", "attribute", "value"],
    filters: { attribute: "currency_code" },
  })
  const foreignPreferences = pricePreferences.filter(
    (preference) => preference.value !== CURRENCY_CODE
  )

  if (foreignPreferences.length) {
    await step(
      `Deleting ${foreignPreferences.length} price preferences for other currencies`,
      () =>
        deletePricePreferencesWorkflow(container).run({
          input: foreignPreferences.map((preference) => preference.id),
        })
    )
  }

  // 5. Return and refund reasons
  const { data: returnReasons } = await query.graph({
    entity: "return_reason",
    fields: ["id", "value"],
  })
  const existingReasonValues = new Set(
    returnReasons.map((reason) => reason.value)
  )
  const reasonsToCreate = RETURN_REASONS.filter(
    (reason) => !existingReasonValues.has(reason.value)
  )

  if (reasonsToCreate.length) {
    await step(`Creating ${reasonsToCreate.length} return reasons`, () =>
      createReturnReasonsWorkflow(container).run({
        input: { data: reasonsToCreate },
      })
    )
  }

  const { data: refundReasons } = await query.graph({
    entity: "refund_reason",
    fields: ["id", "code", "label"],
  })
  const refundReasonUpdates = refundReasons
    .filter(
      (reason) =>
        reason.code &&
        REFUND_REASON_LABELS[reason.code] &&
        reason.label !== REFUND_REASON_LABELS[reason.code]
    )
    .map((reason) => ({
      id: reason.id,
      label: REFUND_REASON_LABELS[reason.code as string],
    }))

  if (refundReasonUpdates.length) {
    await step(`Translating ${refundReasonUpdates.length} refund reasons`, () =>
      updateRefundReasonsWorkflow(container).run({
        input: refundReasonUpdates,
      })
    )
  }

  // 6. Publishable key title
  const { data: apiKeys } = await query.graph({
    entity: "api_key",
    fields: ["id", "title", "type"],
    filters: { title: "Default Publishable API Key" },
  })

  if (apiKeys.length) {
    await step("Renaming the publishable API key", () =>
      updateApiKeysWorkflow(container).run({
        input: {
          selector: { id: apiKeys[0].id },
          update: { title: API_KEY_TITLE },
        },
      })
    )
  }

  logger.info(dryRun ? "Dry run finished" : "Store is configured for Ukraine")
}
