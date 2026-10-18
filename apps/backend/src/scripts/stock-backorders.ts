import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { allowBackorderWorkflow } from "../workflows/stock"
import { updatePricingSettingsStep } from "../workflows/supply/steps/pricing"

const PAGE = 200

const stopSupplierStock = createWorkflow(
  "stop-supplier-stock",
  function () {
    return new WorkflowResponse(updatePricingSettingsStep({ sync_stock: false }))
  }
)

// Run once when holds and backorders are introduced:
//   medusa exec ./src/scripts/stock-backorders.ts
// Every counted variant accepts backorders, and a supplier's price list no
// longer overwrites the shop's own stock (it is kept by hand in the admin).
export default async function stockBackorders({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  let offset = 0
  let changed = 0

  for (;;) {
    const { data } = await query.graph({
      entity: "product_variant",
      fields: ["id"],
      filters: { manage_inventory: true, allow_backorder: false },
      pagination: { skip: offset, take: PAGE, order: { id: "ASC" } },
    })

    if (!data.length) {
      break
    }

    const { result } = await allowBackorderWorkflow(container).run({
      input: { variant_ids: data.map((variant) => variant.id) },
    })

    changed += result.length
    // Changed variants leave the filter; skip the ones that did not.
    offset += data.length - result.length

    if (data.length < PAGE) {
      break
    }
  }

  await stopSupplierStock(container).run({ input: {} })
  logger.info(`Backorders allowed for ${changed} variants; supplier stock sync is off`)
}
