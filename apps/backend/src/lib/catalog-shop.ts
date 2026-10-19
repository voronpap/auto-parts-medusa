import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { MedusaRequest } from "@medusajs/framework/http"
import { brandKey } from "./parsers-db"

export type ShopProduct = { handle: string; title: string }

/**
 * Published shop products sold under these normalised numbers, keyed by
 * brandKey(brand) + "|" + number. The shop key keeps a few signs the parsers
 * drop (a "+", say); such numbers are simply not linked.
 */
export async function shopProductsByNumber(
  req: MedusaRequest,
  norms: string[]
): Promise<Map<string, ShopProduct>> {
  const found = new Map<string, ShopProduct>()

  if (!norms.length) {
    return found
  }

  const db = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const rows: { key: string; brand: string; handle: string; title: string }[] =
    await db
      .select(
        "k.key",
        "b.name as brand",
        "p.handle",
        "p.title"
      )
      .from({ k: "part_number_search_key" })
      .join({ n: "part_number" }, "n.id", "k.part_number_id")
      .join({ b: "parts_brand" }, "b.id", "n.brand_id")
      .join(
        { l: "product_product_variant_partscatalog_part_number" },
        "l.part_number_id",
        "k.part_number_id"
      )
      .join({ v: "product_variant" }, "v.id", "l.product_variant_id")
      .join({ p: "product" }, "p.id", "v.product_id")
      .whereIn("k.key", norms)
      .whereNull("k.deleted_at")
      .whereNull("l.deleted_at")
      .whereNull("v.deleted_at")
      .whereNull("p.deleted_at")
      .where("p.status", "published")

  for (const row of rows) {
    found.set(`${brandKey(row.brand)}|${row.key}`, {
      handle: row.handle,
      title: row.title,
    })
  }

  return found
}
