import {
  ContainerRegistrationKeys,
  MedusaError,
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
import { NumberType } from "../../../modules/parts-catalog/constants"
import PartsCatalogModuleService from "../../../modules/parts-catalog/service"
import {
  formatDisplayNumber,
  normalizeBrandName,
  normalizePartNumber,
} from "../../../modules/parts-catalog/utils/normalize"
import { SUPPLY_MODULE } from "../../../modules/supply"
import SupplyModuleService from "../../../modules/supply/service"
import { categoryFor, productHandle } from "../../../modules/supply/utils/categorize"
import { markupFor, shopPriceMinor } from "../../../modules/supply/utils/markup"

export type CreateProductByNumberInput = {
  brand: string
  number: string
  number_type: NumberType
  title: string
  /** Purchase price in minor units, typed by the owner. */
  purchase_price_minor: number
  quantity: number
}

type Undo = {
  product_id?: string
  link?: { variant_id: string; part_number_id: string }
  number_id?: string
  brand_id?: string
  task_id?: string
}

const CURRENCY = "uah"

const linkOf = (variantId: string, partNumberId: string) => ({
  [Modules.PRODUCT]: { product_variant_id: variantId },
  [PARTS_CATALOG_MODULE]: { part_number_id: partNumberId },
})

/**
 * Creates one product of the shop from a part number the owner typed. The
 * number is found in the parts catalog or added to it, the product gets one
 * variant priced from the typed purchase price by the markup rules, and the
 * number is queued for the parsers, which collect its crosses, fitment and
 * specifications. The purchase price is kept on the variant, so a
 * recalculation of prices does not replace it with a supplier's.
 */
export const createProductByNumberStep = createStep(
  "create-product-by-number",
  async (input: CreateProductByNumberInput, { container }) => {
    const supply = container.resolve<SupplyModuleService>(SUPPLY_MODULE)
    const catalog = container.resolve<PartsCatalogModuleService>(
      PARTS_CATALOG_MODULE
    )
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const link = container.resolve(ContainerRegistrationKeys.LINK)
    const brandKey = normalizeBrandName(input.brand)
    const normalized = normalizePartNumber(input.number)

    if (!brandKey || !normalized) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Brand and number are required"
      )
    }

    const [settings] = await supply.listPricingSettings({}, { take: 1 })
    const rules = await supply.listPricingRules({}, { take: null })
    const markup = markupFor(
      rules,
      settings?.default_markup_bp ?? null,
      brandKey,
      input.purchase_price_minor
    )

    if (markup == null) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Set the markup first: prices are not calculated without one"
      )
    }

    const undo: Undo = {}

    try {
      const [[byName], [byAlias]] = await Promise.all([
        catalog.listBrands({ normalized_name: brandKey }, { take: 1 }),
        catalog.listBrandAliasRecords(
          { normalized_alias: brandKey },
          { relations: ["brand"], take: 1 }
        ),
      ])
      let brand: { id: string; name: string; normalized_name: string } =
        byName ?? byAlias?.brand

      if (!brand) {
        brand = await catalog.createBrands({
          name: input.brand.trim(),
          normalized_name: brandKey,
          kind: "parts_manufacturer",
        })
        undo.brand_id = brand.id
      }

      let [partNumber] = await catalog.listPartNumbers(
        {
          brand_id: brand.id,
          number_type: input.number_type,
          normalized_number: normalized,
        },
        { take: 1 }
      )

      if (!partNumber) {
        partNumber = await catalog.createPartNumbers({
          brand_id: brand.id,
          number_type: input.number_type,
          source_number: input.number.trim(),
          display_number: formatDisplayNumber(input.number),
          normalized_number: normalized,
        })
        undo.number_id = partNumber.id
        await catalog.createPartNumberSearchKeys({
          key: normalized,
          part_number_id: partNumber.id,
        })
      }

      const { data: linked } = await query.graph({
        entity: productVariantPartNumber.entryPoint,
        fields: ["product_variant_id", "product_variant.id"],
        filters: { part_number_id: partNumber.id },
      })
      const orphans = linked.filter((row) => !row.product_variant?.id)

      // Links of deleted products are taken away, so the number can get a new one.
      if (orphans.length) {
        await link.dismiss(orphans.map((row) => linkOf(row.product_variant_id, partNumber.id)))
      }

      // A link left behind by a deleted product does not count as a product.
      if (linked.some((row) => row.product_variant?.id)) {
        throw new MedusaError(
          MedusaError.Types.DUPLICATE_ERROR,
          `${brand.name} ${partNumber.display_number} already has a product`
        )
      }

      const number = partNumber.display_number
      const handle = productHandle(brand.name, number)
      const [{ data: takenHandles }, { data: takenSkus }] = await Promise.all([
        query.graph({ entity: "product", fields: ["id"], filters: { handle } }),
        query.graph({
          entity: "product_variant",
          fields: ["sku"],
          filters: { sku: [number, `${number} ${brand.name}`] },
        }),
      ])
      const skus = new Set(takenSkus.map((variant) => variant.sku))
      // The number is the SKU; the brand is added when another brand already
      // uses the same number.
      const sku = skus.has(number) ? `${number} ${brand.name}` : number

      if (!handle || takenHandles.length || skus.has(sku)) {
        throw new MedusaError(
          MedusaError.Types.DUPLICATE_ERROR,
          `A product with the address "${handle}" or the article "${sku}" already exists`
        )
      }

      const [
        { data: salesChannels },
        { data: shippingProfiles },
        { data: locations },
        { data: categories },
      ] = await Promise.all([
        query.graph({ entity: "sales_channel", fields: ["id"] }),
        query.graph({ entity: "shipping_profile", fields: ["id"] }),
        query.graph({ entity: "stock_location", fields: ["id"] }),
        query.graph({
          entity: "product_category",
          fields: ["id"],
          filters: { name: categoryFor(input.title).name },
        }),
      ])
      const amount =
        shopPriceMinor(
          input.purchase_price_minor,
          markup,
          settings?.rounding_minor ?? 100
        ) / 100
      const title = input.title.trim() || "Запчастина"
      const { result: products } = await createProductsWorkflow(container).run({
        input: {
          products: [
            {
              title: `${title} ${brand.name} ${number}`,
              handle,
              subtitle: `${brand.name} ${number}`,
              status: ProductStatus.PUBLISHED,
              shipping_profile_id: shippingProfiles[0]?.id,
              category_ids: categories[0] ? [categories[0].id] : [],
              sales_channels: salesChannels[0] ? [{ id: salesChannels[0].id }] : [],
              // Medusa needs at least one option; a part has a single variant.
              options: [{ title: "Артикул", values: [number] }],
              variants: [
                {
                  title: number,
                  sku,
                  manage_inventory: true,
                  options: { Артикул: number },
                  prices: [{ amount, currency_code: CURRENCY }],
                  metadata: {
                    purchase_price_minor: input.purchase_price_minor,
                    purchase_brand: brand.normalized_name,
                  },
                },
              ],
            },
          ],
        },
      })
      const product = products[0]
      const variantId = product.variants[0].id
      undo.product_id = product.id

      await link.create(linkOf(variantId, partNumber.id))
      undo.link = { variant_id: variantId, part_number_id: partNumber.id }

      if (input.quantity > 0 && locations[0]) {
        const { data: variants } = await query.graph({
          entity: "product_variant",
          fields: ["inventory_items.inventory_item_id"],
          filters: { id: variantId },
        })
        const item = variants[0]?.inventory_items?.[0]?.inventory_item_id

        if (item) {
          await batchInventoryItemLevelsWorkflow(container).run({
            input: {
              create: [
                {
                  inventory_item_id: item,
                  location_id: locations[0].id,
                  stocked_quantity: input.quantity,
                },
              ],
              update: [],
              delete: [],
            },
          })
        }
      }

      // The parsers collect the rest; one open task per number is enough.
      const [open] = await catalog.listLookupTasks(
        { part_number_id: partNumber.id, status: ["pending", "claimed"] },
        { take: 1 }
      )

      if (!open) {
        const task = await catalog.createLookupTasks({
          part_number_id: partNumber.id,
          status: "pending",
        })
        undo.task_id = task.id
      }

      return new StepResponse(
        {
          product_id: product.id,
          handle,
          title: product.title,
          price: amount,
          currency_code: CURRENCY,
          part_number_id: partNumber.id,
        },
        undo
      )
    } catch (error) {
      // A step that throws is not compensated, so undo partial writes here.
      await undoProduct(container, undo)
      throw error
    }
  },
  async (undo: Undo | undefined, { container }) => {
    if (undo) {
      await undoProduct(container, undo)
    }
  }
)

async function undoProduct(
  container: { resolve: <T>(key: string) => T },
  undo: Undo
) {
  const catalog = container.resolve<PartsCatalogModuleService>(PARTS_CATALOG_MODULE)
  const link = container.resolve<{ dismiss: (data: unknown) => Promise<unknown> }>(
    ContainerRegistrationKeys.LINK
  )

  if (undo.link) {
    await link.dismiss(linkOf(undo.link.variant_id, undo.link.part_number_id))
  }

  if (undo.product_id) {
    await deleteProductsWorkflow(container as never).run({
      input: { ids: [undo.product_id] },
    })
  }

  if (undo.task_id) {
    await catalog.deleteLookupTasks(undo.task_id)
  }

  if (undo.number_id) {
    await catalog.deletePartNumbers(undo.number_id)
  }

  if (undo.brand_id) {
    await catalog.deleteBrands(undo.brand_id)
  }
}
