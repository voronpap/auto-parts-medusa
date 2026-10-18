import {
  createWorkflow,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { updateProductVariantsWorkflow } from "@medusajs/medusa/core-flows"
import { variantsWithoutBackorderStep } from "./steps/allow-backorder"
import {
  pruneStockHoldsStep,
  releaseCartHoldsStep,
  syncCartHoldsStep,
  SyncCartHoldsInput,
} from "./steps/holds"
import { markOrderBackordersStep } from "./steps/order-backorders"
import {
  updateStockSettingsStep,
  UpdateStockSettingsInput,
} from "./steps/settings"

export const syncCartStockHoldsWorkflow = createWorkflow(
  "sync-cart-stock-holds",
  function (input: SyncCartHoldsInput) {
    return new WorkflowResponse(syncCartHoldsStep(input))
  }
)

// A placed order: its lines say what is on backorder, and the cart lets go
// of its holds, because the order's reservations now keep the units.
export const placeOrderStockWorkflow = createWorkflow(
  "place-order-stock",
  function (input: { order_id: string; cart_id: string | null }) {
    const marked = markOrderBackordersStep(input)

    when("release-cart-holds", input, (input) => Boolean(input.cart_id)).then(() => {
      releaseCartHoldsStep({ cart_id: input.cart_id! })
    })

    return new WorkflowResponse(marked)
  }
)

export const pruneStockHoldsWorkflow = createWorkflow(
  "prune-stock-holds",
  function (input: { before: Date }) {
    return new WorkflowResponse(pruneStockHoldsStep(input))
  }
)

export const updateStockSettingsWorkflow = createWorkflow(
  "update-stock-settings",
  function (input: UpdateStockSettingsInput) {
    return new WorkflowResponse(updateStockSettingsStep(input))
  }
)

// The shop accepts a part at zero stock as a backorder ("під замовлення").
export const allowBackorderWorkflow = createWorkflow(
  "allow-backorder",
  function (input: { variant_ids: string[] }) {
    const variants = variantsWithoutBackorderStep(input)

    when("has-variants", { variants }, ({ variants }) => variants.length > 0).then(() => {
      updateProductVariantsWorkflow.runAsStep({
        input: { product_variants: variants },
      })
    })

    return new WorkflowResponse(variants)
  }
)
