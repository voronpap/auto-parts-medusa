import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import {
  batchInventoryItemLevelsWorkflow,
  createProductsWorkflow,
  deleteProductsWorkflow,
} from "@medusajs/medusa/core-flows"
import productVariantPartNumber from "../../../links/product-variant-part-number"
import { PARTS_CATALOG_MODULE } from "../../../modules/parts-catalog"
import PartsCatalogModuleService from "../../../modules/parts-catalog/service"
import { SUPPLY_MODULE } from "../../../modules/supply"
import SupplyModuleService from "../../../modules/supply/service"
import { categoryFor, productHandle } from "../../../modules/supply/utils/categorize"
import { markupFor, shopPriceMinor } from "../../../modules/supply/utils/markup"

export type CreateProductsFromOffersInput = {
  offer_ids: string[]
  /** Shop category id by category name. */
  categories: Record<string, string>
  sales_channel_id: string
  shipping_profile_id: string
  location_id: string | null
}

type Undo = {
  product_ids: string[]
  links: { variant_id: string; part_number_id: string }[]
  number_ids: string[]
  brand_ids: string[]
  offers: { id: string; part_number_id: string | null }[]
}

const linkOf = (variantId: string, partNumberId: string) => ({
  [Modules.PRODUCT]: { product_variant_id: variantId },
  [PARTS_CATALOG_MODULE]: { part_number_id: partNumberId },
})

/**
 * Turns supplier offers into products of the shop. Every offer gets its part
 * number in the parts catalog (created when the catalog does not have it,
 * without queueing a lookup), a published product with one variant priced by
 * the markup rules, and the supplier's stock when stock is synchronised.
 * An offer whose number already has a product, or that has no markup, is
 * left alone.
 */
export const createProductsFromOffersStep = createStep(
  "create-products-from-supply-offers",
  async (input: CreateProductsFromOffersInput, { container }) => {
    const supply = container.resolve<SupplyModuleService>(SUPPLY_MODULE)
    const catalog = container.resolve<PartsCatalogModuleService>(
      PARTS_CATALOG_MODULE
    )
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const link = container.resolve(ContainerRegistrationKeys.LINK)
    const undo: Undo = {
      product_ids: [],
      links: [],
      number_ids: [],
      brand_ids: [],
      offers: [],
    }
    const result = { created: 0, existing: 0, without_markup: 0, skipped: 0 }
    const offers = await supply.listSupplierOffers(
      { id: input.offer_ids, is_listed: true },
      { take: null }
    )

    if (!offers.length) {
      return new StepResponse(result, undo)
    }

    const [settings] = await supply.listPricingSettings({}, { take: 1 })
    const rules = await supply.listPricingRules({}, { take: null })

    try {
      // Brands: by name or alias; a brand the catalog lacks is created.
      const brandKeys = [...new Set(offers.map((offer) => offer.normalized_brand))]
      const [brands, aliases] = await Promise.all([
        catalog.listBrands({ normalized_name: brandKeys }, { take: null }),
        catalog.listBrandAliasRecords(
          { normalized_alias: brandKeys },
          { relations: ["brand"], take: null }
        ),
      ])
      const brandByKey = new Map<string, { id: string; name: string; normalized_name: string }>()

      for (const alias of aliases) {
        brandByKey.set(alias.normalized_alias, alias.brand)
      }

      for (const brand of brands) {
        brandByKey.set(brand.normalized_name, brand)
      }

      for (const offer of offers) {
        if (!brandByKey.has(offer.normalized_brand)) {
          const created = await catalog.createBrands({
            name: offer.brand,
            normalized_name: offer.normalized_brand,
            kind: "parts_manufacturer",
          })
          undo.brand_ids.push(created.id)
          brandByKey.set(offer.normalized_brand, created)
        }
      }

      // Part numbers: found or created, never queued for the parsers here —
      // a whole price list would queue more than they can read in weeks.
      const known = await catalog.listPartNumbers(
        {
          brand_id: [...new Set([...brandByKey.values()].map((brand) => brand.id))],
          number_type: "aftermarket",
          normalized_number: [...new Set(offers.map((offer) => offer.normalized_number))],
        },
        { select: ["id", "brand_id", "normalized_number"], take: null }
      )
      const numberId = new Map(
        known.map((number) => [`${number.brand_id}|${number.normalized_number}`, number.id])
      )
      const missing = offers.filter(
        (offer) =>
          !numberId.has(`${brandByKey.get(offer.normalized_brand)!.id}|${offer.normalized_number}`)
      )

      if (missing.length) {
        const unique = new Map(
          missing.map((offer) => [
            `${brandByKey.get(offer.normalized_brand)!.id}|${offer.normalized_number}`,
            offer,
          ])
        )
        const created = (await catalog.createPartNumbers(
          [...unique.values()].map((offer) => ({
            brand_id: brandByKey.get(offer.normalized_brand)!.id,
            number_type: "aftermarket" as const,
            source_number: offer.number,
            display_number: offer.number,
            normalized_number: offer.normalized_number,
          })) as never
        )) as unknown as { id: string; brand_id: string; normalized_number: string }[]

        await catalog.createPartNumberSearchKeys(
          created.map((number) => ({
            key: number.normalized_number,
            part_number_id: number.id,
          })) as never
        )

        for (const number of created) {
          undo.number_ids.push(number.id)
          numberId.set(`${number.brand_id}|${number.normalized_number}`, number.id)
        }
      }

      const partOf = (offer: (typeof offers)[number]) =>
        numberId.get(`${brandByKey.get(offer.normalized_brand)!.id}|${offer.normalized_number}`)!

      for (const offer of offers) {
        const partNumberId = partOf(offer)

        if (offer.part_number_id !== partNumberId) {
          undo.offers.push({ id: offer.id, part_number_id: offer.part_number_id })
          await supply.updateSupplierOffers({ id: offer.id, part_number_id: partNumberId })
        }
      }

      // Numbers that already have a product are not given a second one.
      const { data: linked } = await query.graph({
        entity: productVariantPartNumber.entryPoint,
        fields: ["part_number_id", "product_variant_id", "product_variant.id"],
        filters: { part_number_id: offers.map(partOf) },
      })
      const orphans = linked.filter((row) => !row.product_variant?.id)

      // Links of deleted products are taken away, so the number can get a new one.
      if (orphans.length) {
        await link.dismiss(orphans.map((row) => linkOf(row.product_variant_id, row.part_number_id)))
      }
      // A link left behind by a deleted product does not count as a product.
      const sold = new Set(
        linked.filter((row) => row.product_variant?.id).map((row) => row.part_number_id)
      )
      const candidates = offers.filter((offer) => {
        if (sold.has(partOf(offer))) {
          result.existing += 1

          return false
        }

        sold.add(partOf(offer))

        return true
      })
      const plans = candidates.flatMap((offer) => {
        const brand = brandByKey.get(offer.normalized_brand)!
        const markup = markupFor(
          rules,
          settings?.default_markup_bp ?? null,
          brand.normalized_name,
          offer.price_minor
        )

        if (markup == null) {
          result.without_markup += 1

          return []
        }

        return [
          {
            offer,
            brand,
            handle: productHandle(brand.name, offer.number),
            amount:
              shopPriceMinor(offer.price_minor, markup, settings?.rounding_minor ?? 100) / 100,
          },
        ]
      })

      // Handles and SKUs are unique in the shop.
      const { data: takenHandles } = plans.length
        ? await query.graph({
            entity: "product",
            fields: ["handle"],
            filters: { handle: plans.map((plan) => plan.handle) },
          })
        : { data: [] }
      const { data: takenSkus } = plans.length
        ? await query.graph({
            entity: "product_variant",
            fields: ["sku"],
            filters: {
              sku: plans.flatMap((plan) => [
                plan.offer.number,
                `${plan.offer.number} ${plan.brand.name}`,
              ]),
            },
          })
        : { data: [] }
      const handles = new Set(takenHandles.map((product) => product.handle))
      const skus = new Set(takenSkus.map((variant) => variant.sku))
      const ready = plans.flatMap((plan) => {
        // The number is the SKU; when another brand already uses the same
        // number, the brand is added to tell them apart.
        const sku = skus.has(plan.offer.number)
          ? `${plan.offer.number} ${plan.brand.name}`
          : plan.offer.number

        if (!plan.handle || handles.has(plan.handle) || skus.has(sku)) {
          result.skipped += 1

          return []
        }

        handles.add(plan.handle)
        skus.add(sku)

        return [{ ...plan, sku }]
      })

      if (!ready.length) {
        return new StepResponse(result, undo)
      }

      const { result: products } = await createProductsWorkflow(container).run({
        input: {
          products: ready.map((plan) => {
            const title = plan.offer.title?.trim() || "Запчастина"
            const category = input.categories[categoryFor(plan.offer.title).name]

            return {
              title: `${title} ${plan.brand.name} ${plan.offer.number}`,
              handle: plan.handle,
              subtitle: `${plan.brand.name} ${plan.offer.number}`,
              status: ProductStatus.PUBLISHED,
              shipping_profile_id: input.shipping_profile_id,
              category_ids: category ? [category] : [],
              sales_channels: [{ id: input.sales_channel_id }],
              // Medusa needs at least one option; a part has a single variant.
              options: [{ title: "Артикул", values: [plan.offer.number] }],
              variants: [
                {
                  title: plan.offer.number,
                  sku: plan.sku,
                  manage_inventory: true,
                  options: { Артикул: plan.offer.number },
                  prices: [{ amount: plan.amount, currency_code: plan.offer.currency_code }],
                },
              ],
            }
          }),
        },
      })
      undo.product_ids = products.map((product) => product.id)
      result.created = products.length

      const variantOf = new Map(
        products.map((product) => [product.handle, product.variants[0].id])
      )
      const links = ready.map((plan) => ({
        variant_id: variantOf.get(plan.handle)!,
        part_number_id: partOf(plan.offer),
      }))

      await link.create(links.map((item) => linkOf(item.variant_id, item.part_number_id)))
      undo.links = links

      if (settings?.sync_stock !== false && input.location_id) {
        const { data: variants } = await query.graph({
          entity: "product_variant",
          fields: ["id", "inventory_items.inventory_item_id"],
          filters: { id: links.map((item) => item.variant_id) },
        })
        const itemOf = new Map(
          variants.map((variant) => [
            variant.id,
            variant.inventory_items?.[0]?.inventory_item_id as string | undefined,
          ])
        )
        const levels = ready.flatMap((plan) => {
          const item = itemOf.get(variantOf.get(plan.handle)!)
          const stock = plan.offer.stock_quantity ?? 0

          return item && stock > 0
            ? [{ inventory_item_id: item, location_id: input.location_id!, stocked_quantity: stock }]
            : []
        })

        if (levels.length) {
          await batchInventoryItemLevelsWorkflow(container).run({
            input: { create: levels, update: [], delete: [] },
          })
        }
      }
    } catch (error) {
      await undoProducts(container, undo)
      throw error
    }

    return new StepResponse(result, undo)
  },
  async (undo: Undo | undefined, { container }) => {
    if (undo) {
      await undoProducts(container, undo)
    }
  }
)

async function undoProducts(container: { resolve: <T>(key: string) => T }, undo: Undo) {
  const supply = container.resolve<SupplyModuleService>(SUPPLY_MODULE)
  const catalog = container.resolve<PartsCatalogModuleService>(PARTS_CATALOG_MODULE)
  const link = container.resolve<{ dismiss: (data: unknown) => Promise<unknown> }>(
    ContainerRegistrationKeys.LINK
  )

  if (undo.links.length) {
    await link.dismiss(undo.links.map((item) => linkOf(item.variant_id, item.part_number_id)))
  }

  if (undo.product_ids.length) {
    await deleteProductsWorkflow(container as never).run({ input: { ids: undo.product_ids } })
  }

  for (const offer of undo.offers) {
    await supply.updateSupplierOffers(offer)
  }

  if (undo.number_ids.length) {
    await catalog.deletePartNumbers(undo.number_ids)
  }

  if (undo.brand_ids.length) {
    await catalog.deleteBrands(undo.brand_ids)
  }
}
