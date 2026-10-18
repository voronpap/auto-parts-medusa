import type { VariantStock } from "@lib/data/stock"
import { HttpTypes } from "@medusajs/types"

export type StockTone = "good" | "wait" | "none"

export type StockText = {
  tone: StockTone
  text: string
  /** A second, smaller line, e.g. that it can still be ordered. */
  note?: string
}

const time = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })
    : ""

export const isAvailable = (variant?: HttpTypes.StoreProductVariant) =>
  Boolean(variant) &&
  (!variant!.manage_inventory ||
    Boolean(variant!.allow_backorder) ||
    (variant!.inventory_quantity ?? 0) > 0)

// What the cached product says until the live status (with other shoppers'
// carts) arrives.
export const staticStock = (
  variant?: HttpTypes.StoreProductVariant,
  withCount = true
): StockText => {
  const quantity = variant?.inventory_quantity ?? 0

  if (!isAvailable(variant)) {
    return { tone: "none", text: "Немає в наявності" }
  }

  if (variant!.manage_inventory && quantity > 0) {
    return { tone: "good", text: withCount ? `В наявності ${quantity} шт.` : "В наявності" }
  }

  return variant!.manage_inventory
    ? { tone: "wait", text: "Під замовлення" }
    : { tone: "good", text: "В наявності" }
}

/** What a product says about itself to a shopper who has not got it yet. */
export function describeStock(
  stock: VariantStock,
  backorderLabel: string,
  withCount = true
): StockText {
  if (!stock.manage_inventory) {
    return { tone: "good", text: "В наявності" }
  }

  if (stock.available > 0) {
    return {
      tone: "good",
      text: withCount ? `В наявності ${stock.available} шт.` : "В наявності",
    }
  }

  if (stock.held_by_others > 0) {
    return {
      tone: "wait",
      text: "Утримується в кошику",
      note: stock.allow_backorder
        ? `Можна замовити: ${backorderLabel.toLowerCase()}. Звільниться до ${time(stock.held_by_others_until)}, якщо покупець не оформить.`
        : `Звільниться до ${time(stock.held_by_others_until)}, якщо покупець не оформить.`,
    }
  }

  if (stock.allow_backorder) {
    return { tone: "wait", text: backorderLabel }
  }

  return { tone: "none", text: "Немає в наявності" }
}

/** What a line of the shopper's own cart says about its units. */
export function describeCartLine(
  stock: VariantStock,
  quantity: number,
  backorderLabel: string
): StockText {
  if (!stock.manage_inventory) {
    return { tone: "good", text: "В наявності" }
  }

  const held = Math.min(stock.held_by_cart, quantity)

  if (held >= quantity) {
    return {
      tone: "good",
      text: "В наявності",
      note: `Утримується за вами до ${time(stock.held_by_cart_until)}`,
    }
  }

  if (held > 0) {
    return {
      tone: "wait",
      text: `${held} шт. в наявності, ${quantity - held} шт. — ${backorderLabel.toLowerCase()}`,
      note: `${held} шт. утримується за вами до ${time(stock.held_by_cart_until)}`,
    }
  }

  const onShelf = Math.min(stock.available, quantity)

  if (onShelf >= quantity) {
    return { tone: "good", text: "В наявності" }
  }

  if (onShelf > 0) {
    return {
      tone: "wait",
      text: `${onShelf} шт. в наявності, ${quantity - onShelf} шт. — ${backorderLabel.toLowerCase()}`,
    }
  }

  return {
    tone: "wait",
    text: backorderLabel,
    note: stock.held_by_others > 0 ? "Останні одиниці утримуються в кошику іншого покупця" : undefined,
  }
}
