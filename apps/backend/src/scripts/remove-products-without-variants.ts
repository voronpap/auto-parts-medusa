/**
 * Removes products that have no variant: what an interrupted bulk creation
 * leaves behind. Such a product cannot be priced or bought.
 *
 *   pnpm exec medusa exec ./src/scripts/remove-products-without-variants.ts
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { deleteProductsWorkflow } from "@medusajs/medusa/core-flows"

export default async function removeProductsWithoutVariants({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const db = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const { rows } = await db.raw(
    `select p.id from product p
     where p.deleted_at is null
       and not exists (select 1 from product_variant v where v.product_id = p.id and v.deleted_at is null)`
  )
  const ids = rows.map((row: { id: string }) => row.id)

  if (ids.length) {
    await deleteProductsWorkflow(container).run({ input: { ids } })
  }

  logger.info(`Removed ${ids.length} products without variants`)
}
