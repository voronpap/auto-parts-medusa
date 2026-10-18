"use server"

import { sdk } from "@lib/config"
import { getCartId } from "./cookies"

export type VariantStock = {
  variant_id: string
  manage_inventory: boolean
  allow_backorder: boolean
  /** Units this shopper can buy from the shelf; their own cart's hold included. */
  available: number
  held_by_others: number
  held_by_others_until: string | null
  held_by_cart: number
  held_by_cart_until: string | null
}

export type StockResponse = {
  variants: VariantStock[]
  backorder_label: string
  hold_minutes: number
}

/**
 * Live availability of variants for the shopper asking: never cached, since
 * other shoppers' carts change it from minute to minute.
 */
export async function retrieveStock(variantIds: string[]): Promise<StockResponse | null> {
  const ids = Array.from(new Set(variantIds.filter(Boolean))).slice(0, 200)

  if (!ids.length) {
    return null
  }

  const cartId = await getCartId()

  return sdk.client
    .fetch<StockResponse>("/store/stock", {
      method: "GET",
      query: { variant_id: ids.join(","), ...(cartId ? { cart_id: cartId } : {}) },
      cache: "no-store",
    })
    .catch(() => null)
}
