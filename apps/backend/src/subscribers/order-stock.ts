import { SubscriberArgs, type SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { placeOrderStockWorkflow } from "../workflows/stock"

export default async function orderStockHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  if (!data?.id) {
    return
  }

  try {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id", "cart.id"],
      filters: { id: data.id },
    })
    const cartId = (orders[0] as { cart?: { id: string } | null })?.cart?.id ?? null

    await placeOrderStockWorkflow(container).run({
      input: { order_id: data.id, cart_id: cartId },
    })
  } catch (error) {
    logger.warn(`Stock of order ${data.id} was not marked: ${(error as Error).message}`)
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
