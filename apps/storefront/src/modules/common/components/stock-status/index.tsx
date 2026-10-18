"use client"

import { retrieveStock, StockResponse, VariantStock } from "@lib/data/stock"
import { describeCartLine, describeStock, StockText } from "@lib/util/stock"
import { useEffect, useState } from "react"

export const STOCK_CHANGED = "ap:stock-changed"

type Entry = { stock: VariantStock | null; label: string }
type Listener = (entry: Entry) => void

// Statuses on one page are asked for in one request.
const listeners = new Map<string, Set<Listener>>()
let queued = new Set<string>()
let timer: ReturnType<typeof setTimeout> | null = null

function deliver(ids: string[], response: StockResponse | null) {
  for (const id of ids) {
    const entry = {
      stock: response?.variants.find((row) => row.variant_id === id) ?? null,
      label: response?.backorder_label || "Під замовлення",
    }

    listeners.get(id)?.forEach((listener) => listener(entry))
  }
}

function request(id: string) {
  queued.add(id)

  if (timer) {
    return
  }

  timer = setTimeout(async () => {
    const ids = Array.from(queued)

    queued = new Set()
    timer = null
    deliver(ids, await retrieveStock(ids).catch(() => null))
  }, 30)
}

/** Asks every status on the page again, e.g. after the cart changed. */
export function refreshStock() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(STOCK_CHANGED))
  }
}

function useVariantStock(variantId?: string | null) {
  const [entry, setEntry] = useState<Entry | null>(null)

  useEffect(() => {
    if (!variantId) {
      return
    }

    const listener: Listener = setEntry
    const ask = () => request(variantId)
    // The server holds a cart's parts a moment after the cart changes.
    const askSoon = () => {
      ask()
      setTimeout(ask, 1500)
    }

    if (!listeners.has(variantId)) {
      listeners.set(variantId, new Set())
    }

    listeners.get(variantId)!.add(listener)
    ask()
    window.addEventListener(STOCK_CHANGED, askSoon)
    window.addEventListener("focus", ask)

    const tick = setInterval(ask, 60_000)

    return () => {
      listeners.get(variantId)?.delete(listener)
      window.removeEventListener(STOCK_CHANGED, askSoon)
      window.removeEventListener("focus", ask)
      clearInterval(tick)
    }
  }, [variantId])

  return entry
}

const Text = ({ status, compact }: { status: StockText; compact?: boolean }) => (
  <span className={`ap-stock ap-stock-${status.tone}`} data-testid="stock-status">
    <span>● {status.text}</span>
    {status.note && !compact && <small className="ap-stock-note">{status.note}</small>}
  </span>
)

/** Availability of a product for a shopper who has not got it in the cart. */
export function StockStatus({
  variantId,
  fallback,
  compact,
}: {
  variantId?: string | null
  /** Shown until the live status arrives. */
  fallback?: StockText
  compact?: boolean
}) {
  const entry = useVariantStock(variantId)

  if (!entry?.stock) {
    return fallback ? <Text status={fallback} compact={compact} /> : null
  }

  // Lists keep it short: no unit count, no second line.
  return <Text status={describeStock(entry.stock, entry.label, !compact)} compact={compact} />
}

/** How a line of the shopper's own cart stands: held, on the shelf, ordered. */
export function CartLineStock({
  variantId,
  quantity,
}: {
  variantId?: string | null
  quantity: number
}) {
  const entry = useVariantStock(variantId)

  if (!entry?.stock) {
    return null
  }

  return <Text status={describeCartLine(entry.stock, quantity, entry.label)} />
}
