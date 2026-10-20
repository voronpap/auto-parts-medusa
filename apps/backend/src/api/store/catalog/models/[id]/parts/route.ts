import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { parsersDb } from "../../../../../../lib/parsers-db"
import { vehicleGroupParts, vehicleSections } from "../../../../../../lib/vehicle-parts"

const Query = z.object({
  // Only versions built in this year; all versions of the model without it.
  year: z.coerce.number().int().min(1900).max(2100).optional(),
  group: z.coerce.number().int().min(0).optional(),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
})

// A model has a few dozen versions at most; this keeps an odd one cheap.
const MAX_VERSIONS = 150

/**
 * Parts for a TecDoc model when the shopper has not chosen the engine: every
 * version of the model, or those built in the chosen year, grouped like a
 * single version's parts.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const db = parsersDb()
  const id = Number(req.params.id)
  const parsed = Query.safeParse(req.query)

  if (!db || !Number.isInteger(id) || !parsed.success) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Model not found")
  }

  const [model] = await db("tecdoc_model as mo")
    .join("tecdoc_make as ma", function () {
      this.on("ma.id", "mo.make_id").andOn("ma.type", "mo.type")
    })
    .select("mo.id", "mo.name", "mo.year_from", "mo.year_to", "ma.id as make_id", "ma.name as make")
    .where({ "mo.type": "P", "mo.id": id })

  if (!model) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Model not found")
  }

  const { year, group, offset } = parsed.data
  const versions = db("tecdoc_vehicle").select("id").where({ type: "P", model_id: id })

  if (year) {
    versions
      .where((builder) => builder.whereNull("year_from").orWhere("year_from", "<=", year))
      .where((builder) => builder.whereNull("year_to").orWhere("year_to", ">=", year))
  }

  const ktypes = ((await versions.limit(MAX_VERSIONS)) as { id: number }[]).map((row) =>
    Number(row.id)
  )
  const context = { model, year: year ?? null, versions: ktypes.length }

  if (!ktypes.length) {
    return res.status(200).json(
      group === undefined
        ? { ...context, total: 0, sections: [], other: 0 }
        : { ...context, group, label: "", section: null, offset, more: false, parts: [] }
    )
  }

  if (group === undefined) {
    return res.status(200).json({ ...context, ...(await vehicleSections(db, ktypes)) })
  }

  return res.status(200).json({
    ...context,
    ...(await vehicleGroupParts(req, db, ktypes, group, offset)),
  })
}
