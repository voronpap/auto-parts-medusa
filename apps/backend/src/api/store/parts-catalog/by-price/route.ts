import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"

type Knex = {
  raw: (sql: string, bindings?: unknown[]) => Promise<{ rows: { id: string; total?: string }[] }>
}

const toInt = (value: unknown) => (typeof value === "string" ? Number.parseInt(value, 10) : value)

const Query = z.object({
  order: z.enum(["asc", "desc"]).default("asc"),
  category_id: z.string().max(100).optional(),
  q: z.string().trim().max(100).optional(),
  currency_code: z.string().length(3).default("uah"),
  limit: z.preprocess(toInt, z.number().int().min(1).max(100).default(12)),
  offset: z.preprocess(toInt, z.number().int().min(0).max(100_000).default(0)),
})

/**
 * Published products ordered by their lowest price, across the whole shop:
 * the store's product list cannot order by price, so the page is chosen here
 * and the products are then read as usual.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const parsed = Query.safeParse(req.query)

  if (!parsed.success) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid sort query")
  }

  const { order, category_id: categoryId, q, currency_code: currency, limit, offset } = parsed.data
  const db = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION)
  const where: string[] = ["p.deleted_at is null", "p.status = 'published'"]
  const bindings: unknown[] = [currency.toLowerCase()]

  if (categoryId) {
    where.push(
      "exists (select 1 from product_category_product pcp where pcp.product_id = p.id and pcp.product_category_id = ?)"
    )
    bindings.push(categoryId)
  }

  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
    where.push(
      "(p.title ilike ? or p.subtitle ilike ? or p.handle ilike ? or exists (select 1 from product_variant sv where sv.product_id = p.id and sv.deleted_at is null and sv.sku ilike ?))"
    )
    bindings.push(like, like, like, like)
  }

  // Lowest current price of the product's variants in the shop's currency.
  const priced = `
    select p.id, min(pr.amount) as amount
    from product p
    join product_variant v on v.product_id = p.id and v.deleted_at is null
    join product_variant_price_set vps on vps.variant_id = v.id and vps.deleted_at is null
    join price pr on pr.price_set_id = vps.price_set_id and pr.deleted_at is null
      and pr.price_list_id is null and pr.currency_code = ?
    where ${where.join(" and ")}
    group by p.id`
  const [page, total] = await Promise.all([
    db.raw(`${priced} order by amount ${order === "asc" ? "asc" : "desc"}, p.id limit ? offset ?`, [
      ...bindings,
      limit,
      offset,
    ]),
    db.raw(`select count(*) as total from (${priced}) t`, bindings),
  ])

  return res.status(200).json({
    product_ids: page.rows.map((row) => row.id),
    count: Number(total.rows[0]?.total ?? 0),
  })
}
