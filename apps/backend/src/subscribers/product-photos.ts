import { SubscriberArgs, type SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { storeProductPhotosWorkflow } from "../workflows/parts-catalog/product-photos"

export const PRODUCT_PHOTOS_REQUESTED = "parts-catalog.product-photos-requested"

// One product at a time per process: the server is small and the sources are
// someone else's. Requests for a product already waiting are dropped.
const MAX_WAITING = 20
const waiting = new Set<string>()
let queue: Promise<unknown> = Promise.resolve()

export default async function productPhotosHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  if (!data?.id || waiting.has(data.id) || waiting.size >= MAX_WAITING) {
    return
  }

  waiting.add(data.id)
  queue = queue
    .then(() => storeProductPhotosWorkflow(container).run({ input: { product_id: data.id } }))
    .catch((error) =>
      logger.warn(`Product photos for ${data.id} were not stored: ${(error as Error).message}`)
    )
    .finally(() => waiting.delete(data.id))
}

export const config: SubscriberConfig = {
  event: PRODUCT_PHOTOS_REQUESTED,
}
