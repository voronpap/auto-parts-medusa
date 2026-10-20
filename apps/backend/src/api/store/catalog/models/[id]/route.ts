import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { parsersDb } from "../../../../../lib/parsers-db"
import { MOTORCYCLE } from "../../../../../lib/tecdoc-groups"

/** One model of the TecDoc tree with its versions (KType). */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const db = parsersDb()
  const id = Number(req.params.id)

  if (!db || !Number.isInteger(id)) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Model not found")
  }

  const [model] = await db("tecdoc_model as mo")
    .join("tecdoc_make as ma", function () {
      this.on("ma.id", "mo.make_id").andOn("ma.type", "mo.type")
    })
    .select(
      "mo.id",
      "mo.name",
      "mo.year_from",
      "mo.year_to",
      "ma.id as make_id",
      "ma.name as make"
    )
    .where({ "mo.type": "P", "mo.id": id })

  if (!model) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Model not found")
  }

  const vehicles = await db("tecdoc_vehicle")
    .select(
      "id",
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
    .where({ type: "P", model_id: id })
    .where((builder) => builder.whereNull("body").orWhereNot("body", MOTORCYCLE))
    .orderBy(["description", "year_from"])

  return res.status(200).json({ model, vehicles })
}
