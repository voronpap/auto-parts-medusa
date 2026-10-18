import { SubscriberArgs, type SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { syncCartStockHoldsWorkflow } from "../workflows/stock"

// Every change of a cart (a line added, removed or changed, an address or a
// delivery chosen) holds its parts again for the configured minutes.
export default async function stockHoldsHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  if (!data?.id) {
    return
  }

  try {
    await syncCartStockHoldsWorkflow(container).run({ input: { cart_id: data.id } })
  } catch (error) {
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .warn(`Stock holds of cart ${data.id} were not updated: ${(error as Error).message}`)
  }
}

export const config: SubscriberConfig = {
  event: ["cart.created", "cart.updated"],
}
