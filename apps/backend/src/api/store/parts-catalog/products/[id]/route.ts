import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import productVariantPartNumber from "../../../../../links/product-variant-part-number"
import { fuelName } from "../../../../../modules/parts-catalog/utils/fuel"
import { PARTS_CATALOG_MODULE } from "../../../../../modules/parts-catalog"
import PartsCatalogModuleService from "../../../../../modules/parts-catalog/service"

// Only confirmed facts are shown to shoppers; candidates stay in the admin.
const PUBLIC_VERDICTS = ["ACCEPTED", "CONDITIONAL"] as const
const CROSS_TYPES = [
  "OEM_REFERENCE",
  "AFTERMARKET_CROSS",
  "MANUFACTURER_INTERCHANGE",
  "SUPERSEDED_BY",
] as const
const MAX_CROSSES = 400
const MAX_APPLICATIONS = 6000
const MAX_ENGINES = 14

type NumberRow = {
  id: string
  display_number: string
  number_type: string
  brand?: { name: string } | null
}

type Cross = {
  brand: string
  number: string
  kind: "oem" | "aftermarket" | "replacement" | "replaces"
  conditional: boolean
  product: { handle: string; title: string } | null
}

type ModelFitment = {
  model: string
  year_from: number | null
  year_to: number | null
  engines: string[]
  more_engines: number
  conditional: boolean
}

/**
 * What the parts catalog knows about a product's part numbers, in the shape
 * the storefront shows: crosses, vehicles it fits and characteristics.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const catalog = req.scope.resolve<PartsCatalogModuleService>(
    PARTS_CATALOG_MODULE
  )
  const { data: variants } = await query.graph({
    entity: "product_variant",
    fields: [
      "id",
      "product.status",
      "part_numbers.id",
      "part_numbers.display_number",
      "part_numbers.number_type",
      "part_numbers.brand.name",
    ],
    filters: { product_id: req.params.id },
  })
  const published = variants.filter(
    (variant) => variant.product?.status === "published"
  )
  const numbers = published.flatMap(
    (variant) => (variant.part_numbers ?? []) as unknown as NumberRow[]
  )
  const ids = [...new Set(numbers.map((number) => number.id))]

  if (!ids.length) {
    return res.status(200).json({
      numbers: [],
      crosses: [],
      fitment: [],
      attributes: [],
    })
  }

  const filters = {
    relation_type: [...CROSS_TYPES],
    applicability_verdict: [...PUBLIC_VERDICTS],
    relationship_state: "ASSERTED" as const,
  }
  const [outgoing, incoming, applications, attributes] = await Promise.all([
    catalog.listPartRelationships(
      { from_part_number_id: ids, ...filters },
      { relations: ["to_part_number", "to_part_number.brand"], take: MAX_CROSSES }
    ),
    catalog.listPartRelationships(
      { to_part_number_id: ids, ...filters },
      {
        relations: ["from_part_number", "from_part_number.brand"],
        take: MAX_CROSSES,
      }
    ),
    catalog.listPartApplications(
      { part_number_id: ids, applicability_verdict: [...PUBLIC_VERDICTS] },
      {
        relations: ["vehicle_make", "vehicle_model"],
        order: { make: "ASC", model: "ASC", year_from: "ASC" },
        take: MAX_APPLICATIONS,
      }
    ),
    catalog.listPartAttributes(
      { part_number_id: ids },
      { order: { name: "ASC" }, take: 100 }
    ),
  ])

  const crosses = new Map<string, Cross & { id: string }>()
  const addCross = (
    other: NumberRow | null | undefined,
    relationType: string,
    verdict: string,
    direction: "out" | "in"
  ) => {
    if (!other || ids.includes(other.id) || crosses.has(other.id)) {
      return
    }

    const kind: Cross["kind"] =
      relationType === "SUPERSEDED_BY"
        ? direction === "out"
          ? "replacement"
          : "replaces"
        : other.number_type === "oem" || relationType === "OEM_REFERENCE"
          ? other.number_type === "oem"
            ? "oem"
            : "aftermarket"
          : "aftermarket"

    crosses.set(other.id, {
      id: other.id,
      brand: other.brand?.name ?? "",
      number: other.display_number,
      kind,
      conditional: verdict === "CONDITIONAL",
      product: null,
    })
  }

  for (const relationship of outgoing) {
    addCross(
      relationship.to_part_number as unknown as NumberRow,
      relationship.relation_type,
      relationship.applicability_verdict,
      "out"
    )
  }

  for (const relationship of incoming) {
    addCross(
      relationship.from_part_number as unknown as NumberRow,
      relationship.relation_type,
      relationship.applicability_verdict,
      "in"
    )
  }

  // Crosses the store itself sells link straight to their product page.
  if (crosses.size) {
    const { data: links } = await query.graph({
      entity: productVariantPartNumber.entryPoint,
      fields: ["product_variant_id", "part_number_id"],
      filters: { part_number_id: [...crosses.keys()] },
    })

    if (links.length) {
      const { data: sold } = await query.graph({
        entity: "product_variant",
        fields: ["id", "product.handle", "product.title", "product.status"],
        filters: { id: links.map((link) => link.product_variant_id) },
      })
      const byVariant = new Map(sold.map((variant) => [variant.id, variant]))

      for (const link of links) {
        const product = byVariant.get(link.product_variant_id)?.product
        const cross = crosses.get(link.part_number_id)

        if (cross && product?.status === "published" && product.handle) {
          cross.product = { handle: product.handle, title: product.title }
        }
      }
    }
  }

  const kindOrder = { replacement: 0, oem: 1, aftermarket: 2, replaces: 3 }
  const crossList = [...crosses.values()]
    .map(({ id: _id, ...cross }) => cross)
    .sort(
      (a, b) =>
        Number(Boolean(b.product)) - Number(Boolean(a.product)) ||
        kindOrder[a.kind] - kindOrder[b.kind] ||
        a.brand.localeCompare(b.brand) ||
        a.number.localeCompare(b.number)
    )

  const makes = new Map<string, Map<string, ModelFitment & { all: Set<string> }>>()

  for (const application of applications) {
    const make = (application.vehicle_make?.name ?? application.make).trim()
    const model = (
      application.vehicle_model?.name ??
      application.model ??
      ""
    ).trim()
    const models = makes.get(make) ?? new Map()
    const entry = models.get(model) ?? {
      model,
      year_from: null,
      year_to: null,
      engines: [],
      more_engines: 0,
      conditional: false,
      all: new Set<string>(),
      openEnded: false,
    }

    if (application.year_from != null) {
      entry.year_from =
        entry.year_from == null
          ? application.year_from
          : Math.min(entry.year_from, application.year_from)
    }

    if (application.year_to == null) {
      entry.openEnded = true
    } else {
      entry.year_to = Math.max(entry.year_to ?? 0, application.year_to)
    }

    const engine = [
      application.engine,
      fuelName(application.fuel),
      application.power_kw ? `${application.power_kw} кВт` : null,
    ]
      .filter(Boolean)
      .join(", ")

    if (engine) {
      entry.all.add(engine)
    }

    entry.conditional ||= application.applicability_verdict === "CONDITIONAL"
    models.set(model, entry)
    makes.set(make, models)
  }

  const fitment = [...makes.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([make, models]) => ({
      make,
      models: [...models.values()]
        .sort((a, b) => a.model.localeCompare(b.model))
        .map(({ all, openEnded, ...entry }: any) => {
          const engines = [...(all as Set<string>)]

          return {
            ...entry,
            // A row without an end year means the model is still fitted.
            year_to: openEnded ? null : entry.year_to,
            engines: engines.slice(0, MAX_ENGINES),
            more_engines: Math.max(0, engines.length - MAX_ENGINES),
          } as ModelFitment
        }),
    }))

  const seen = new Set<string>()
  const attributeList = attributes
    .filter((attribute) => {
      const key = `${attribute.name}|${attribute.value}`

      if (attribute.name === "Назва" || seen.has(key)) {
        return false
      }

      seen.add(key)

      return true
    })
    .map((attribute) => ({
      name: attribute.name,
      value: attribute.value,
      unit: attribute.unit,
    }))

  return res.status(200).json({
    numbers: numbers.map((number) => ({
      brand: number.brand?.name ?? "",
      number: number.display_number,
      number_type: number.number_type,
    })),
    crosses: crossList,
    fitment,
    attributes: attributeList,
  })
}
