import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { PARTS_CATALOG_MODULE } from "../../../../../modules/parts-catalog"
import PartsCatalogModuleService from "../../../../../modules/parts-catalog/service"
import {
  familyKey,
  familyLabel,
} from "../../../../../modules/parts-catalog/utils/vehicle-family"
import { listModels, listProductIds } from "../queries"

const Query = z.object({
  family: z.string().trim().min(1).max(80).optional(),
  year: z.coerce.number().int().min(1950).max(2100).optional(),
})

type Family = {
  key: string
  label: string
  year_from: number | null
  year_to: number | null
  // A fitment row without an end year: the model is still served.
  open_ended: boolean
  model_ids: string[]
  names: string[]
}

/**
 * Model families of a make that the store has parts for and, when a family
 * is chosen, the products that fit it (in a given year, if one is given).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const db = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const catalog = req.scope.resolve<PartsCatalogModuleService>(
    PARTS_CATALOG_MODULE
  )
  const parsed = Query.safeParse(req.query)
  const { family, year } = parsed.success
    ? parsed.data
    : { family: undefined, year: undefined }
  const make = await catalog.retrieveVehicleMake(req.params.make_id, {
    select: ["id", "name"],
  })
  const models = await listModels(db, make.id)
  const families = new Map<string, Family>()

  for (const model of models) {
    const key = familyKey(model.name)

    if (!key) {
      continue
    }

    const entry: Family = families.get(key) ?? {
      key,
      label: familyLabel(key),
      year_from: null,
      year_to: null,
      open_ended: false,
      model_ids: [],
      names: [],
    }

    if (model.year_from != null) {
      entry.year_from =
        entry.year_from == null
          ? model.year_from
          : Math.min(entry.year_from, model.year_from)
    }

    if (model.year_to != null) {
      entry.year_to = Math.max(entry.year_to ?? 0, model.year_to)
    }

    entry.open_ended ||= model.open_ended
    entry.model_ids.push(model.id)
    entry.names.push(model.name)
    families.set(key, entry)
  }

  const summary = (entry: Family) => ({
    key: entry.key,
    label: entry.label,
    year_from: entry.year_from,
    year_to: entry.open_ended ? null : entry.year_to,
  })
  const chosen = family ? families.get(family.toLowerCase()) : undefined
  const productIds = chosen
    ? await listProductIds(db, make.id, chosen.model_ids, year ?? null)
    : []

  return res.status(200).json({
    make: { id: make.id, name: make.name },
    families: [...families.values()]
      .map(summary)
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })),
    family: chosen ? { ...summary(chosen), names: [...chosen.names].sort() } : null,
    product_ids: productIds,
  })
}
