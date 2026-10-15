import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import productVariantPartNumber from "../../../../../links/product-variant-part-number"
import { PARTS_CATALOG_MODULE } from "../../../../../modules/parts-catalog"
import PartsCatalogModuleService from "../../../../../modules/parts-catalog/service"
import { normalizeBrandName } from "../../../../../modules/parts-catalog/utils/normalize"
import {
  familyKey,
  familyLabel,
  familyOf,
  inFamily,
} from "../../../../../modules/parts-catalog/utils/vehicle-family"
import {
  decodeVin,
  modelHasTypeCode,
} from "../../../../../modules/parts-catalog/utils/vin"

const PUBLIC_VERDICTS = ["ACCEPTED", "CONDITIONAL"] as const
const VPIC_URL = "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues"
const VPIC_TIMEOUT_MS = 6000
const CACHE_LIMIT = 500

type Vpic = { make?: string; model?: string; year?: number; engine?: string }

// Decoded VINs do not change, so answers of the public decoder are kept.
const vpicCache = new Map<string, Vpic>()

/**
 * Asks the public NHTSA decoder. It knows North American vehicles in detail
 * and most others hardly at all, so its answer only adds to ours.
 */
async function askVpic(vin: string): Promise<Vpic> {
  const cached = vpicCache.get(vin)

  if (cached) {
    return cached
  }

  let answer: Vpic = {}

  try {
    const response = await fetch(`${VPIC_URL}/${vin}?format=json`, {
      signal: AbortSignal.timeout(VPIC_TIMEOUT_MS),
    })
    const row = ((await response.json()) as { Results?: Record<string, string>[] })
      .Results?.[0]

    if (response.ok && row) {
      const litres = Number.parseFloat(row.DisplacementL ?? "")

      answer = {
        make: row.Make || undefined,
        model: row.Model || undefined,
        year: Number.parseInt(row.ModelYear ?? "", 10) || undefined,
        engine:
          [
            Number.isFinite(litres) ? `${litres.toFixed(1)} л` : null,
            row.FuelTypePrimary || null,
            row.EngineModel || null,
          ]
            .filter(Boolean)
            .join(", ") || undefined,
      }
    }
  } catch {
    // The decoder being slow or down must not break the lookup.
    return {}
  }

  if (vpicCache.size >= CACHE_LIMIT) {
    vpicCache.delete(vpicCache.keys().next().value as string)
  }

  vpicCache.set(vin, answer)

  return answer
}

/**
 * Reads a VIN and returns the vehicle it names and the store's products the
 * parts catalog lists for that vehicle.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const decoded = decodeVin(req.params.vin)

  if (!decoded) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "A VIN is 17 letters and digits without I, O and Q"
    )
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const catalog = req.scope.resolve<PartsCatalogModuleService>(
    PARTS_CATALOG_MODULE
  )
  // The public decoder is only asked when the VIN itself says too little.
  const vpic = decoded.type_code ? {} : await askVpic(decoded.vin)
  const makeName = decoded.make ?? vpic.make ?? null
  const years = decoded.years.length
    ? decoded.years
    : vpic.year
      ? [vpic.year]
      : []
  const vehicle = {
    vin: decoded.vin,
    make: makeName,
    years,
    type_code: decoded.type_code,
    model: vpic.model ?? null,
    engine: vpic.engine ?? null,
    models: [] as string[],
    make_id: null as string | null,
    /** The model family the matched models belong to, for the shopper's garage. */
    family: null as { key: string; label: string; names: string[] } | null,
  }

  if (!makeName) {
    return res.status(200).json({ vehicle, precision: "none", products: [] })
  }

  const key = normalizeBrandName(makeName)
  const [byName] = await catalog.listVehicleMakes({ normalized_name: key })
  const [byAlias] = byName
    ? []
    : await catalog.listVehicleMakeAliasRecords(
        { normalized_alias: key },
        { relations: ["make"] }
      )
  const make = byName ?? byAlias?.make

  if (!make) {
    return res.status(200).json({ vehicle, precision: "none", products: [] })
  }

  vehicle.make = make.name
  vehicle.make_id = make.id

  const models = await catalog.listVehicleModels(
    { make_id: make.id },
    { select: ["id", "name"], take: null }
  )
  const coded = decoded.type_code
    ? models.filter((model) => modelHasTypeCode(model.name, decoded.type_code!))
    : []
  // Sources that do not print type codes name the same model by family.
  const families = coded.length
    ? coded.map((model) => familyOf(model.name))
    : vpic.model
      ? [familyOf(vpic.model)]
      : []
  const matched = models.filter(
    (model) =>
      coded.includes(model) ||
      families.some((family) => inFamily(model.name, family))
  )

  vehicle.models = matched.map((model) => model.name).sort()

  // Only one family is offered for the garage; two would be a guess.
  const keys = [...new Set(vehicle.models.map(familyKey))]

  if (keys.length === 1) {
    vehicle.family = {
      key: keys[0],
      label: familyLabel(keys[0]),
      names: vehicle.models,
    }
  }

  const applications = await catalog.listPartApplications(
    {
      vehicle_make_id: make.id,
      applicability_verdict: [...PUBLIC_VERDICTS],
      ...(matched.length
        ? { vehicle_model_id: matched.map((model) => model.id) }
        : {}),
    },
    { select: ["part_number_id", "year_from", "year_to"], take: null }
  )
  const fitsYear = (from: number | null, to: number | null) =>
    !years.length ||
    years.some((year) => (from == null || from <= year) && (to == null || to >= year))
  const numberIds = [
    ...new Set(
      applications
        .filter((row) => fitsYear(row.year_from, row.year_to))
        .map((row) => row.part_number_id)
    ),
  ]
  const precision = matched.length ? "model" : "make"

  if (!numberIds.length) {
    return res.status(200).json({ vehicle, precision, products: [] })
  }

  const { data: links } = await query.graph({
    entity: productVariantPartNumber.entryPoint,
    fields: ["product_variant_id", "part_number_id"],
    filters: { part_number_id: numberIds },
  })

  if (!links.length) {
    return res.status(200).json({ vehicle, precision, products: [] })
  }

  const { data: variants } = await query.graph({
    entity: "product_variant",
    fields: ["id", "product.id", "product.handle", "product.status"],
    filters: { id: links.map((link) => link.product_variant_id) },
  })
  const products = new Map<string, { product_id: string; handle: string }>()

  for (const variant of variants) {
    const product = variant.product

    if (product?.handle && product.status === "published") {
      products.set(product.id, { product_id: product.id, handle: product.handle })
    }
  }

  return res
    .status(200)
    .json({ vehicle, precision, products: [...products.values()] })
}
