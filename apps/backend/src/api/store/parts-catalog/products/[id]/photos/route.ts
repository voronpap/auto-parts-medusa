import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { PRODUCT_PHOTOS_REQUESTED } from "../../../../../../subscribers/product-photos"

// A product is asked about at most once in this window, however often it is
// opened, so a busy page does not keep a source busy.
const QUIET_MS = 10 * 60 * 1000
const asked = new Map<string, number>()

/**
 * Called by the storefront when a product without photos is opened: copying
 * the photos its part numbers have at their sources is queued. The
 * response does not wait for the copy.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id
  const now = Date.now()

  if (now - (asked.get(id) ?? 0) < QUIET_MS) {
    return res.status(202).json({ queued: false })
  }

  asked.set(id, now)

  if (asked.size > 5000) {
    for (const [key, at] of asked) {
      if (now - at >= QUIET_MS) {
        asked.delete(key)
      }
    }
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "status", "thumbnail", "images.id", "variants.part_numbers.id"],
    filters: { id },
  })
  const product = products[0] as
    | {
        status: string
        thumbnail: string | null
        images?: { id: string }[] | null
        variants?: { part_numbers?: ({ id: string } | null)[] | null }[] | null
      }
    | undefined

  if (!product || product.status !== "published" || product.thumbnail || product.images?.length) {
    return res.status(202).json({ queued: false })
  }

  // The copy looks in the shop catalogue and then in the parsers' one, so a
  // product with a part number is always worth asking about.
  const hasNumber = (product.variants ?? []).some((variant) =>
    (variant.part_numbers ?? []).some(Boolean)
  )

  if (!hasNumber) {
    return res.status(202).json({ queued: false })
  }

  await req.scope
    .resolve(Modules.EVENT_BUS)
    .emit({ name: PRODUCT_PHOTOS_REQUESTED, data: { id } })

  return res.status(202).json({ queued: true })
}
