/**
 * Leaves a small shelf in the shop and removes every other product.
 *
 *   KEEP=20 pnpm exec medusa exec ./src/scripts/keep-products.ts
 *
 * The products kept are the ones the parts catalog describes best (most
 * crosses and fitment), at most MAX_PER_CATEGORY from one category. Without
 * CONFIRM=yes the script only lists what it would keep. Part numbers,
 * crosses and suppliers' offers are not touched.
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { deleteProductsWorkflow } from "@medusajs/medusa/core-flows"

const BATCH = 100
const MAX_PER_CATEGORY = 4

type Knex = {
  raw: (sql: string, bindings?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
}

export default async function keepProducts({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const knex = container.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION)
  const keep = Number.parseInt(process.env.KEEP ?? "20", 10)
  // How well the catalog describes each number.
  const { rows } = await knex.raw(`
    select n.id,
      (select count(*) from part_relationship r
        where r.deleted_at is null and (r.from_part_number_id = n.id or r.to_part_number_id = n.id))
      + (select count(*) from part_application a
        where a.deleted_at is null and a.part_number_id = n.id) as score
    from part_number n where n.deleted_at is null
      and (exists (select 1 from part_relationship r where r.deleted_at is null and r.from_part_number_id = n.id)
        or exists (select 1 from part_application a where a.deleted_at is null and a.part_number_id = n.id))
  `)
  const score = new Map(rows.map((row) => [row.id as string, Number(row.score)]))
  const products: { id: string; title: string; category: string; score: number }[] = []

  for (let skip = 0; ; skip += 1000) {
    const { data } = await query.graph({
      entity: "product",
      fields: ["id", "title", "categories.name", "variants.part_numbers.id"],
      pagination: { skip, take: 1000, order: { id: "ASC" } },
    })

    for (const product of data) {
      const numbers = (product.variants ?? []).flatMap((variant) =>
        ((variant as { part_numbers?: ({ id: string } | null)[] }).part_numbers ?? []).map(
          (number) => number?.id ?? ""
        )
      )

      products.push({
        id: product.id,
        title: product.title,
        category: product.categories?.[0]?.name ?? "",
        score: Math.max(0, ...numbers.map((id) => score.get(id) ?? 0)),
      })
    }

    if (data.length < 1000) {
      break
    }
  }

  const perCategory = new Map<string, number>()
  const kept = new Set<string>()

  for (const product of [...products].sort((a, b) => b.score - a.score)) {
    const taken = perCategory.get(product.category) ?? 0

    if (kept.size >= keep || taken >= MAX_PER_CATEGORY) {
      continue
    }

    perCategory.set(product.category, taken + 1)
    kept.add(product.id)
    logger.info(`Keep: ${product.title} [${product.category}] score ${product.score}`)
  }

  const remove = products.filter((product) => !kept.has(product.id)).map((product) => product.id)
  logger.info(`Products ${products.length}, keep ${kept.size}, remove ${remove.length}`)

  if (process.env.CONFIRM !== "yes") {
    logger.info("Nothing removed: set CONFIRM=yes to remove")

    return
  }

  for (let start = 0; start < remove.length; start += BATCH) {
    await deleteProductsWorkflow(container).run({
      input: { ids: remove.slice(start, start + BATCH) },
    })
    logger.info(`Removed ${Math.min(start + BATCH, remove.length)} of ${remove.length}`)
  }

  logger.info(`Done ${JSON.stringify({ kept: kept.size, removed: remove.length })}`)
}
