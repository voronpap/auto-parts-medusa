import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { parsersDb } from "../../../../../lib/parsers-db"
import { vehicleGroupParts, vehicleSections } from "../../../../../lib/vehicle-parts"

const Query = z.object({
  // A TecDoc group (a section or one of its groups); 0 is "other", the parts
  // that have no group yet.
  group: z.coerce.number().int().min(0).optional(),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
})

/**
 * A TecDoc vehicle version (KType) and the parts the catalogue lists for it:
 * the TecDoc sections and groups those parts fall into, in Ukrainian, or one
 * group's parts page by page.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const db = parsersDb()
  const ktype = Number(req.params.ktype)
  const parsed = Query.safeParse(req.query)

  if (!db || !Number.isInteger(ktype) || !parsed.success) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Vehicle not found")
  }

  const [vehicle] = await db("tecdoc_vehicle")
    .select(
      "id",
      "make_id",
      "model_id",
      "make",
      "model",
      "description",
      "year_from",
      "month_from",
      "year_to",
      "month_to",
      "kw_from",
      "hp_from",
      "capacity_ccm",
      "fuel",
      "body",
      "drive",
      "engine_codes"
    )
    .where({ type: "P", id: ktype })

  if (!vehicle) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Vehicle not found")
  }

  if (parsed.data.group === undefined) {
    return res.status(200).json({ vehicle, ...(await vehicleSections(db, [ktype])) })
  }

  return res.status(200).json({
    vehicle,
    ...(await vehicleGroupParts(req, db, [ktype], parsed.data.group, parsed.data.offset)),
  })
}
