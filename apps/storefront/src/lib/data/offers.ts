"use server"

import { sdk } from "@lib/config"
import { addToCart } from "./cart"

/**
 * Puts a supplier's offer in the cart. The shop's product for it is made the
 * first time somebody buys it.
 */
export async function addOfferToCart(offerId: string, countryCode: string) {
  const { variant_id } = await sdk.client.fetch<{ variant_id: string; handle: string }>(
    `/store/parts-catalog/offers/${encodeURIComponent(offerId)}/product`,
    { method: "POST" }
  )

  await addToCart({ variantId: variant_id, quantity: 1, countryCode })
}
