/**
 * Creates the store's first products and puts them in the parts catalog.
 *
 *   pnpm exec medusa exec ./src/scripts/seed-first-products.ts
 *
 * Each product has one variant whose SKU is the manufacturer's part number,
 * so the catalog links it to that number and the parser service looks up its
 * crosses and fitment. Prices are placeholders to be replaced with real ones,
 * and no stock is added, so nothing can be ordered until that is done.
 *
 * Safe to re-run: a product whose handle exists is skipped.
 */
import type { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
  ProductStatus,
} from "@medusajs/framework/utils"
import {
  createProductCategoriesWorkflow,
  createProductsWorkflow,
} from "@medusajs/medusa/core-flows"
import { PARTS_CATALOG_MODULE } from "../modules/parts-catalog"
import PartsCatalogModuleService from "../modules/parts-catalog/service"
import { catalogProductWorkflow } from "../workflows/parts-catalog/catalog-product"

type Item = {
  brand: string
  number: string
  title: string
  category: string
  price: number
  description: string
}

const OIL_FILTERS = "Масляні фільтри"
const BRAKE_PADS = "Гальмівні колодки"
const SHOCK_ABSORBERS = "Амортизатори"

// Latin handles keep category addresses readable.
const CATEGORY_HANDLES: Record<string, string> = {
  [OIL_FILTERS]: "oil-filters",
  [BRAKE_PADS]: "brake-pads",
  [SHOCK_ABSORBERS]: "shock-absorbers",
}

const ITEMS: Item[] = [
  {
    brand: "Bosch",
    number: "0 986 424 797",
    title: "Гальмівні колодки передні, комплект",
    category: BRAKE_PADS,
    price: 1450,
    description: "Комплект гальмівних колодок дискового гальма на передню вісь.",
  },
  {
    brand: "Bosch",
    number: "0 986 495 412",
    title: "Гальмівні колодки передні, комплект",
    category: BRAKE_PADS,
    price: 1350,
    description: "Комплект гальмівних колодок дискового гальма на передню вісь.",
  },
  {
    brand: "febi",
    number: "16502",
    title: "Гальмівні колодки, комплект",
    category: BRAKE_PADS,
    price: 1100,
    description: "Комплект гальмівних колодок дискового гальма.",
  },
  {
    brand: "Bosch",
    number: "0 451 103 314",
    title: "Масляний фільтр",
    category: OIL_FILTERS,
    price: 280,
    description: "Накручуваний масляний фільтр двигуна.",
  },
  {
    brand: "MANN-FILTER",
    number: "W 712/95",
    title: "Масляний фільтр",
    category: OIL_FILTERS,
    price: 330,
    description: "Накручуваний масляний фільтр двигуна.",
  },
  {
    brand: "MANN-FILTER",
    number: "W 719/30",
    title: "Масляний фільтр",
    category: OIL_FILTERS,
    price: 310,
    description: "Накручуваний масляний фільтр двигуна.",
  },
  {
    brand: "MANN-FILTER",
    number: "HU 719/7 x",
    title: "Масляний фільтр",
    category: OIL_FILTERS,
    price: 390,
    description: "Фільтрувальний елемент масляного фільтра двигуна.",
  },
  {
    brand: "FILTRON",
    number: "OP 520",
    title: "Масляний фільтр",
    category: OIL_FILTERS,
    price: 190,
    description: "Накручуваний масляний фільтр двигуна.",
  },
  {
    brand: "FILTRON",
    number: "OP 526/1",
    title: "Масляний фільтр",
    category: OIL_FILTERS,
    price: 200,
    description: "Накручуваний масляний фільтр двигуна.",
  },
  {
    brand: "FILTRON",
    number: "OP 572",
    title: "Масляний фільтр",
    category: OIL_FILTERS,
    price: 210,
    description: "Накручуваний масляний фільтр двигуна.",
  },
  {
    brand: "febi",
    number: "22550",
    title: "Масляний фільтр",
    category: OIL_FILTERS,
    price: 220,
    description: "Накручуваний масляний фільтр двигуна.",
  },
  {
    brand: "KYB",
    number: "3358015",
    title: "Амортизатор передній Excel-G",
    category: SHOCK_ABSORBERS,
    price: 3400,
    description: "Газомасляний амортизатор серії Excel-G на передню вісь.",
  },
  {
    brand: "KYB",
    number: "3448024",
    title: "Амортизатор задній Excel-G",
    category: SHOCK_ABSORBERS,
    price: 2300,
    description: "Газомасляний амортизатор серії Excel-G на задню вісь.",
  },
  {
    brand: "Monroe",
    number: "G16495",
    title: "Амортизатор передній",
    category: SHOCK_ABSORBERS,
    price: 3100,
    description: "Газомасляний амортизатор на передню вісь.",
  },
  {
    brand: "Monroe",
    number: "G1057",
    title: "Амортизатор задній",
    category: SHOCK_ABSORBERS,
    price: 2100,
    description: "Газомасляний амортизатор на задню вісь.",
  },
]

const handleOf = (item: Item) =>
  `${item.brand}-${item.number}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

export default async function seedFirstProducts({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const catalog =
    container.resolve<PartsCatalogModuleService>(PARTS_CATALOG_MODULE)

  const { data: salesChannels } = await query.graph({
    entity: "sales_channel",
    fields: ["id"],
  })
  const { data: shippingProfiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id"],
  })

  if (!salesChannels[0] || !shippingProfiles[0]) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "No sales channel or shipping profile found"
    )
  }

  const brandIds = new Map<string, string>()

  for (const name of new Set(ITEMS.map((item) => item.brand))) {
    const [brand] = await catalog.listBrands({ name })

    if (!brand) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Brand ${name} is not in the parts catalog`
      )
    }

    brandIds.set(name, brand.id)
  }

  const { data: existingCategories } = await query.graph({
    entity: "product_category",
    fields: ["id", "name"],
  })
  const missing = [...new Set(ITEMS.map((item) => item.category))].filter(
    (name) => !existingCategories.some((category) => category.name === name)
  )

  if (missing.length) {
    await createProductCategoriesWorkflow(container).run({
      input: {
        product_categories: missing.map((name) => ({
          name,
          handle: CATEGORY_HANDLES[name],
          is_active: true,
        })),
      },
    })
    logger.info(`Created ${missing.length} categories`)
  }

  const { data: categories } = await query.graph({
    entity: "product_category",
    fields: ["id", "name"],
  })
  const categoryId = (name: string) =>
    categories.find((category) => category.name === name)!.id as string

  const { data: existing } = await query.graph({
    entity: "product",
    fields: ["id", "handle"],
  })
  const taken = new Set(existing.map((product) => product.handle))
  const fresh = ITEMS.filter((item) => !taken.has(handleOf(item)))

  if (fresh.length) {
    await createProductsWorkflow(container).run({
      input: {
        products: fresh.map((item) => ({
          title: `${item.title} ${item.brand} ${item.number}`,
          handle: handleOf(item),
          subtitle: `${item.brand} ${item.number}`,
          description: item.description,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfiles[0].id,
          category_ids: [categoryId(item.category)],
          sales_channels: [{ id: salesChannels[0].id }],
          // Medusa needs at least one option; a part has a single variant.
          options: [{ title: "Артикул", values: [item.number] }],
          variants: [
            {
              title: item.number,
              sku: item.number,
              options: { Артикул: item.number },
              manage_inventory: true,
              prices: [{ amount: item.price, currency_code: "uah" }],
            },
          ],
        })),
      },
    })
    logger.info(`Created ${fresh.length} products`)
  }

  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "handle"],
    filters: { handle: ITEMS.map(handleOf) },
  })

  for (const item of ITEMS) {
    const product = products.find((row) => row.handle === handleOf(item))

    if (!product) {
      continue
    }

    const { result } = await catalogProductWorkflow(container).run({
      input: {
        product_id: product.id,
        brand_id: brandIds.get(item.brand)!,
        number_type: "aftermarket",
      },
    })
    logger.info(
      `${item.brand} ${item.number}: ${result.links.length} number(s) linked`
    )
  }

  logger.info("Done.")
}
