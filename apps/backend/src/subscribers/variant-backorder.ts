import { SubscriberArgs, type SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { allowBackorderWorkflow } from "../workflows/stock"

// The shop takes orders for a part it has none of ("під замовлення"), so a
// new variant whose stock is counted accepts backorders. The owner can still
// switch that off for a product afterwards.
export default async function variantBackorderHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string } | { id: string }[]>) {
  const ids = (Array.isArray(data) ? data : [data]).map((row) => row?.id).filter(Boolean)

  if (!ids.length) {
    return
  }

  try {
    await allowBackorderWorkflow(container).run({ input: { variant_ids: ids } })
  } catch (error) {
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .warn(`Backorders were not allowed for ${ids.join(", ")}: ${(error as Error).message}`)
  }
}

export const config: SubscriberConfig = {
  event: "product-variant.created",
}
