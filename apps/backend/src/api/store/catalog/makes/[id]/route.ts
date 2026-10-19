import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { parsersDb } from "../../../../../lib/parsers-db"

/** One make of the TecDoc tree with its models. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const db = parsersDb()
  const id = Number(req.params.id)

  if (!db || !Number.isInteger(id)) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Make not found")
  }

  const [make] = await db("tecdoc_make")
    .select("id", "name")
    .where({ type: "P", id })

  if (!make) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Make not found")
  }

  const models = await db("tecdoc_model")
    .select("id", "name", "year_from", "month_from", "year_to", "month_to")
    .where({ type: "P", make_id: id })
    .orderBy(["name", "year_from"])

  return res.status(200).json({ make, models })
}
