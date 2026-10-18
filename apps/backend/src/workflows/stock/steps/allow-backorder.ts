import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

// Variants whose stock is counted but which still refuse orders at zero.
export const variantsWithoutBackorderStep = createStep(
  "variants-without-backorder",
  async (input: { variant_ids: string[] }, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "product_variant",
      fields: ["id", "manage_inventory", "allow_backorder"],
      filters: { id: input.variant_ids },
    })

    return new StepResponse(
      data
        .filter((variant) => variant.manage_inventory && !variant.allow_backorder)
        .map((variant) => ({ id: variant.id, allow_backorder: true }))
    )
  }
)
