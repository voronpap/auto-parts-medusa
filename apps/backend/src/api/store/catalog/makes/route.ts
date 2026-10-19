import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { parsersDb } from "../../../../lib/parsers-db"

/** Car makes of the TecDoc vehicle tree (passenger and light commercial). */
export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  const db = parsersDb()

  if (!db) {
    return res.status(200).json({ makes: [] })
  }

  const makes = await db("tecdoc_make")
    .select("id", "name")
    .where("type", "P")
    .orderBy("name")

  return res.status(200).json({ makes })
}
