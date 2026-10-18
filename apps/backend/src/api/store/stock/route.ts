import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { stockSettingsOf, variantStock } from "../../../workflows/stock/availability"

const ids = z
  .union([z.string(), z.array(z.string())])
  .transform((value) =>
    (Array.isArray(value) ? value : value.split(","))
      .map((id) => id.trim())
      .filter(Boolean)
  )
  .pipe(z.array(z.string().max(100)).min(1).max(200))

const Query = z.object({
  variant_id: ids,
  // The asking shopper's cart: its own holds do not make parts unavailable
  // to it.
  cart_id: z.string().max(100).optional(),
})

/** What a shopper can buy now: units on the shelf, holds, backorder text. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const parsed = Query.safeParse(req.query)

  if (!parsed.success) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Pass variant_id")
  }

  const salesChannels =
    (req as MedusaRequest & {
      publishable_key_context?: { sales_channel_ids?: string[] }
    }).publishable_key_context?.sales_channel_ids ?? []
  const [variants, settings] = await Promise.all([
    variantStock(req.scope, {
      variant_ids: [...new Set(parsed.data.variant_id)],
      cart_id: parsed.data.cart_id ?? null,
      sales_channel_ids: salesChannels,
    }),
    stockSettingsOf(req.scope),
  ])

  res.setHeader("Cache-Control", "no-store")

  return res.status(200).json({
    variants: variants.map(({ inventory: _, ...variant }) => variant),
    backorder_label: settings.backorder_label,
    hold_minutes: settings.hold_minutes,
  })
}
