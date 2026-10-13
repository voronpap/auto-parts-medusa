/**
 * Creates products from part numbers the parts catalog already describes:
 * MANN-FILTER filters and FEBEST chassis parts that fit Chinese cars.
 *
 *   pnpm exec medusa exec ./src/scripts/seed-catalog-products.ts
 *
 * A product is made only from a number that has a name and fitment in the
 * catalog, so its page shows crosses and vehicles from the first minute.
 * Prices are placeholders by kind of part and no stock is added, so nothing
 * can be ordered until real prices and quantities are entered.
 *
 * Safe to re-run: a number that already has a product is skipped.
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
import productVariantPartNumber from "../links/product-variant-part-number"
import { PARTS_CATALOG_MODULE } from "../modules/parts-catalog"
import PartsCatalogModuleService from "../modules/parts-catalog/service"
import { catalogProductWorkflow } from "../workflows/parts-catalog/catalog-product"

const TARGET = 100
const BATCH = 20
// So one kind of part does not fill the whole shelf.
const MAX_PER_TITLE = 6
const CHINESE_MAKES =
  /^(chery|geely|byd|great wall|gwm|haval|changan|mg|jac|faw|lifan|exeed|omoda|jetour|jaecoo|vortex|baic|bestune)\b/i

type Kind = { category: string; handle: string; price: number }

const KINDS = {
  oil: { category: "Масляні фільтри", handle: "oil-filters", price: 250 },
  air: { category: "Повітряні фільтри", handle: "air-filters", price: 350 },
  cabin: { category: "Фільтри салону", handle: "cabin-filters", price: 400 },
  fuel: { category: "Паливні фільтри", handle: "fuel-filters", price: 450 },
  pads: { category: "Гальмівні колодки", handle: "brake-pads", price: 900 },
  brakes: { category: "Гальмівна система", handle: "brake-system", price: 300 },
  shocks: { category: "Амортизатори", handle: "shock-absorbers", price: 2200 },
  suspension: { category: "Підвіска", handle: "suspension", price: 900 },
  steering: { category: "Рульове керування", handle: "steering", price: 550 },
  drive: { category: "Привід", handle: "drivetrain", price: 450 },
  engine: { category: "Двигун", handle: "engine", price: 700 },
} satisfies Record<string, Kind>

type Named = { title: string; kind: Kind }

const side = (name: string, left: string, right: string) =>
  /\bLEFT\b/.test(name) ? ` ${left}` : /\bRIGHT\b/.test(name) ? ` ${right}` : ""

/** Ukrainian name and kind of a FEBEST part; undefined when not sure. */
function febestName(name: string): Named | undefined {
  const front = /\bFRONT\b/.test(name)
  const rear = /\bREAR\b/.test(name)
  let match: RegExpMatchArray | null

  if (/STABILIZER LINK/.test(name)) {
    return {
      title: `Стійка стабілізатора ${front ? "передня" : "задня"}${side(name, "ліва", "права")}`,
      kind: KINDS.suspension,
    }
  }

  if ((match = name.match(/^PAD KIT, DISC BRAKE, (FRONT|REAR)/))) {
    return {
      title: `Гальмівні колодки ${match[1] === "FRONT" ? "передні" : "задні"}, комплект`,
      kind: KINDS.pads,
    }
  }

  if (name === "SHOE KIT, REAR BRAKE") {
    return { title: "Гальмівні колодки задні барабанні, комплект", kind: KINDS.pads }
  }

  if (/SHOCK ABSORBER/.test(name)) {
    return {
      title: `Амортизатор ${front ? "передній" : "задній"}${side(name, "лівий", "правий")}${/GAS/.test(name) ? " газовий" : ""}`,
      kind: KINDS.shocks,
    }
  }

  if (name === "BALL JOINT FRONT LOWER ARM") {
    return { title: "Кульова опора переднього нижнього важеля", kind: KINDS.suspension }
  }

  if (/^(LEFT|RIGHT) FRONT ARM$/.test(name)) {
    return { title: `Важіль передній${side(name, "лівий", "правий")}`, kind: KINDS.suspension }
  }

  if (/TRANSVERSE LINK/.test(name)) {
    return {
      title:
        `Важіль задній поперечний${/UPPER/.test(name) ? " верхній" : /LOWER/.test(name) ? " нижній" : ""}` +
        side(name, "лівий", "правий") +
        (/WITH BALL JOINT/.test(name) ? " з кульовою опорою" : "") +
        (/REPAIR KIT/.test(name) ? ", ремкомплект" : ""),
      kind: KINDS.suspension,
    }
  }

  if (/TRAILING ROD/.test(name)) {
    return { title: `Тяга задня поздовжня${side(name, "ліва", "права")}`, kind: KINDS.suspension }
  }

  if (/^(LEFT|RIGHT) REAR UPPER ROD$/.test(name)) {
    return { title: `Тяга задня верхня${side(name, "ліва", "права")}`, kind: KINDS.suspension }
  }

  if (name === "REAR LOWER ARM") {
    return { title: "Важіль задній нижній", kind: KINDS.suspension }
  }

  if (/^(FRONT|REAR) WHEEL HUB$/.test(name)) {
    return { title: `Маточина колеса ${front ? "передня" : "задня"}`, kind: KINDS.suspension }
  }

  if (/^STEERING TIE ROD END( LEFT| RIGHT)?$/.test(name)) {
    return { title: `Наконечник рульової тяги${side(name, "лівий", "правий")}`, kind: KINDS.steering }
  }

  if (name === "STEERING TIE ROD") {
    return { title: "Рульова тяга", kind: KINDS.steering }
  }

  if ((match = name.match(/^BOOT (INNER|OUTER) CV JOINT KIT(?: PVC)? ([\dX.]+)$/))) {
    return {
      title: `Пильовик ШРКШ ${match[1] === "INNER" ? "внутрішній" : "зовнішній"}, комплект ${match[2].toLowerCase()}`,
      kind: KINDS.drive,
    }
  }

  if ((match = name.match(/^TRIPOD JOINT ([\dX.]+)$/))) {
    return { title: `Трипоїд ${match[1].toLowerCase()}`, kind: KINDS.drive }
  }

  if (/^(FRONT|REAR) CALIPER SLIDE PIN$/.test(name)) {
    return { title: `Напрямна супорта ${front ? "переднього" : "заднього"}`, kind: KINDS.brakes }
  }

  if ((match = name.match(/^(FRONT|REAR) CALIPER PISTON (D\d+)$/))) {
    return { title: `Поршень супорта ${front ? "переднього" : "заднього"} ${match[2]}`, kind: KINDS.brakes }
  }

  if (name === "TENSION PULLEY") {
    return { title: "Ролик натяжний", kind: KINDS.engine }
  }

  if (name === "BELT TENSIONER") {
    return { title: "Натягувач ременя", kind: KINDS.engine }
  }

  if (name === "PULLEY TENSIONER KIT") {
    return { title: "Натягувач ременя з роликом, комплект", kind: KINDS.engine }
  }

  if ((match = name.match(/^THERMOSTAT (\d+°C)$/))) {
    return { title: `Термостат ${match[1]}`, kind: KINDS.engine }
  }

  if (name === "CABIN FILTER") {
    return { title: "Фільтр салону", kind: KINDS.cabin }
  }

  return rear || front ? undefined : undefined
}

/** Name and kind of a MANN-FILTER product from the catalogue's own name. */
function mannName(name: string, number: string): Named | undefined {
  const base = name.replace(number, "").replace(/\s+/g, " ").trim()

  if (/^Масляний фільтр/.test(base)) return { title: "Масляний фільтр", kind: KINDS.oil }
  if (/^Повітряний фільтр салону/.test(base)) {
    const sort = base.split("|")[1]?.trim()

    return {
      title: sort && sort !== "Частинки" ? `Фільтр салону (${sort.toLowerCase()})` : "Фільтр салону",
      kind: KINDS.cabin,
    }
  }
  if (/^Повітряний фільтр/.test(base)) return { title: "Повітряний фільтр", kind: KINDS.air }
  if (/^Паливний фільтр/.test(base)) return { title: "Паливний фільтр", kind: KINDS.fuel }

  return undefined
}

const pretty = (text: string) =>
  text
    .toLowerCase()
    .replace(/(^|[\s/(-])([a-zа-яіїє])/g, (_, lead, letter) => lead + letter.toUpperCase())
    .replace(/\b(Byd|Mg|Jac|Faw|Gwm|Baic)\b/g, (word) => word.toUpperCase())

export default async function seedCatalogProducts({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const catalog =
    container.resolve<PartsCatalogModuleService>(PARTS_CATALOG_MODULE)
  const { data: salesChannels } = await query.graph({ entity: "sales_channel", fields: ["id"] })
  const { data: shippingProfiles } = await query.graph({ entity: "shipping_profile", fields: ["id"] })

  if (!salesChannels[0] || !shippingProfiles[0]) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "No sales channel or shipping profile found")
  }

  const { data: links } = await query.graph({
    entity: productVariantPartNumber.entryPoint,
    fields: ["part_number_id"],
  })
  const sold = new Set(links.map((link) => link.part_number_id))
  const { data: existingProducts } = await query.graph({ entity: "product", fields: ["handle"] })
  const takenHandles = new Set(existingProducts.map((product) => product.handle))
  const picked: {
    brand: string
    brandId: string
    number: string
    named: Named
    description: string
    handle: string
  }[] = []
  const perTitle = new Map<string, number>()

  for (const brandName of ["MANN-FILTER", "FEBEST"]) {
    const [brand] = await catalog.listBrands({ name: brandName })

    if (!brand) {
      continue
    }

    const numbers = await catalog.listPartNumbers(
      { brand_id: brand.id, number_type: "aftermarket" },
      { relations: ["attributes"], order: { display_number: "ASC" }, take: null }
    )

    for (const number of numbers) {
      if (picked.length >= TARGET) {
        break
      }

      const name = number.attributes.find((attribute) => attribute.name === "Назва")?.value

      if (!name || sold.has(number.id)) {
        continue
      }

      const named =
        brandName === "FEBEST" ? febestName(name) : mannName(name, number.display_number)

      if (!named || (perTitle.get(named.title) ?? 0) >= MAX_PER_TITLE) {
        continue
      }

      const applications = await catalog.listPartApplications(
        { part_number_id: number.id },
        { select: ["make", "model"], take: 400 }
      )
      const vehicles = [
        ...new Set(
          applications
            .filter((row) => CHINESE_MAKES.test(row.make))
            .map((row) => pretty(`${row.make} ${(row.model ?? "").replace(/\s*\([^)]*\)/g, "")}`.trim()))
        ),
      ]

      // Only parts the catalog lists for a Chinese car.
      if (!vehicles.length) {
        continue
      }

      const handle = `${brandName}-${number.display_number}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")

      if (takenHandles.has(handle)) {
        continue
      }

      takenHandles.add(handle)
      perTitle.set(named.title, (perTitle.get(named.title) ?? 0) + 1)
      picked.push({
        brand: brandName,
        brandId: brand.id,
        number: number.display_number,
        named,
        handle,
        description:
          `Підходить до: ${vehicles.slice(0, 8).join(", ")}` +
          (vehicles.length > 8 ? " та інших" : "") +
          ". Повний перелік авто й оригінальні номери — нижче на сторінці.",
      })
    }
  }

  if (!picked.length) {
    logger.info("Nothing to create: no described numbers without a product")
    return
  }

  const { data: existingCategories } = await query.graph({
    entity: "product_category",
    fields: ["id", "name"],
  })
  const wanted = [...new Map(picked.map((item) => [item.named.kind.category, item.named.kind])).values()]
  const missing = wanted.filter(
    (kind) => !existingCategories.some((category) => category.name === kind.category)
  )

  if (missing.length) {
    await createProductCategoriesWorkflow(container).run({
      input: {
        product_categories: missing.map((kind) => ({
          name: kind.category,
          handle: kind.handle,
          is_active: true,
        })),
      },
    })
    logger.info(`Created ${missing.length} categories`)
  }

  const { data: categories } = await query.graph({ entity: "product_category", fields: ["id", "name"] })
  const categoryId = (name: string) =>
    categories.find((category) => category.name === name)!.id as string

  for (let start = 0; start < picked.length; start += BATCH) {
    const batch = picked.slice(start, start + BATCH)

    await createProductsWorkflow(container).run({
      input: {
        products: batch.map((item) => ({
          title: `${item.named.title} ${item.brand} ${item.number}`,
          handle: item.handle,
          subtitle: `${item.brand} ${item.number}`,
          description: item.description,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfiles[0].id,
          category_ids: [categoryId(item.named.kind.category)],
          sales_channels: [{ id: salesChannels[0].id }],
          // Medusa needs at least one option; a part has a single variant.
          options: [{ title: "Артикул", values: [item.number] }],
          variants: [
            {
              title: item.number,
              sku: item.number,
              manage_inventory: true,
              options: { Артикул: item.number },
              prices: [{ amount: item.named.kind.price, currency_code: "uah" }],
            },
          ],
        })),
      },
    })
    logger.info(`Created ${Math.min(start + BATCH, picked.length)}/${picked.length} products`)
  }

  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "handle"],
    filters: { handle: picked.map((item) => item.handle) },
  })
  let linked = 0

  for (const item of picked) {
    const product = products.find((row) => row.handle === item.handle)

    if (!product) {
      continue
    }

    const { result } = await catalogProductWorkflow(container).run({
      input: { product_id: product.id, brand_id: item.brandId, number_type: "aftermarket" },
    })
    linked += result.links.length
  }

  const byBrand = picked.reduce<Record<string, number>>(
    (totals, item) => ({ ...totals, [item.brand]: (totals[item.brand] ?? 0) + 1 }),
    {}
  )
  logger.info(`Done: ${picked.length} products ${JSON.stringify(byBrand)}, ${linked} numbers linked`)
}
