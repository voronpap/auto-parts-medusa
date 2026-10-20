import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { parsersDb } from "../../../../lib/parsers-db"
import { MOTORCYCLE } from "../../../../lib/tecdoc-groups"

/** Car makes of the TecDoc vehicle tree (passenger and light commercial). */
export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  const db = parsersDb()

  if (!db) {
    return res.status(200).json({ makes: [] })
  }

  // Makes with at least one car (not a motorcycle) in the tree.
  const makes = await db("tecdoc_make")
    .select("id", "name")
    .where("type", "P")
    .whereExists(
      db("tecdoc_vehicle as v")
        .select(db.raw("1"))
        .whereRaw("v.make_id = tecdoc_make.id")
        .where("v.type", "P")
        .where((builder) => builder.whereNull("v.body").orWhereNot("v.body", MOTORCYCLE))
    )
    .orderBy("name")

  return res.status(200).json({ makes })
}
