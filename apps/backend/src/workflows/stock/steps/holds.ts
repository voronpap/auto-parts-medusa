import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { STOCK_MODULE } from "../../../modules/stock"
import StockModuleService from "../../../modules/stock/service"
import {
  itemStock,
  levelsOf,
  salesChannelLocations,
  stockSettingsOf,
  VARIANT_STOCK_FIELDS,
} from "../availability"

// One lock for all holds: two carts must not both take the last unit, and
// holding is quick.
export const STOCK_HOLDS_LOCK = "stock-holds"

type HoldRow = {
  cart_id: string
  line_item_id: string
  variant_id: string
  inventory_item_id: string
  quantity: number
  expires_at: Date
}

type Resolver = { resolve: <T>(key: string) => T }

const stockOf = (container: Resolver) =>
  container.resolve<StockModuleService>(STOCK_MODULE)

const copy = (hold: HoldRow): HoldRow => ({
  cart_id: hold.cart_id,
  line_item_id: hold.line_item_id,
  variant_id: hold.variant_id,
  inventory_item_id: hold.inventory_item_id,
  quantity: hold.quantity,
  expires_at: new Date(hold.expires_at),
})

type HoldsUndo = { cart_id: string; previous: HoldRow[] }

const undoHolds = async (undo: HoldsUndo | undefined, { container }: { container: Resolver }) => {
  if (!undo) {
    return
  }

  const stock = stockOf(container)
  const current = await stock.listStockHolds({ cart_id: undo.cart_id }, { take: null })

  if (current.length) {
    await stock.deleteStockHolds(current.map((hold) => hold.id))
  }

  if (undo.previous.length) {
    await stock.createStockHolds(undo.previous)
  }
}

export type SyncCartHoldsInput = { cart_id: string }

// Makes a cart's holds match its lines: each line holds as many units as are
// free on the shelf (other carts' holds and orders' reservations aside), and
// the clock starts again. Lines beyond that are accepted as backorders.
export const syncCartHoldsStep = createStep(
  "sync-cart-holds",
  async (input: SyncCartHoldsInput, { container }) => {
    const locking = container.resolve(Modules.LOCKING)
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const stock = stockOf(container)

    const { held, undo } = await locking.execute(STOCK_HOLDS_LOCK, async () => {
      const previous = await stock.listStockHolds({ cart_id: input.cart_id }, { take: null })
      const undo: HoldsUndo = { cart_id: input.cart_id, previous: previous.map(copy) }

      if (previous.length) {
        await stock.deleteStockHolds(previous.map((hold) => hold.id))
      }

      const { data: carts } = await query.graph({
        entity: "cart",
        fields: [
          "id",
          "completed_at",
          "sales_channel_id",
          "items.id",
          "items.variant_id",
          "items.quantity",
          "items.created_at",
        ],
        filters: { id: input.cart_id },
      })
      const cart = carts[0]
      const items = (cart?.items ?? [])
        .filter((item) => item?.variant_id && Number(item.quantity) > 0)
        .sort((a, b) => +new Date(a!.created_at as Date) - +new Date(b!.created_at as Date))

      if (!cart || cart.completed_at || !items.length) {
        return { held: [] as HoldRow[], undo }
      }

      const { data: variants } = await query.graph({
        entity: "product_variant",
        fields: VARIANT_STOCK_FIELDS,
        filters: { id: [...new Set(items.map((item) => item!.variant_id!))] },
      })
      const locations = await salesChannelLocations(
        container,
        cart.sales_channel_id ? [cart.sales_channel_id] : []
      )
      const levels = await itemStock(container, {
        levels: levelsOf(variants as never, locations),
        cart_id: input.cart_id,
      })
      const free = new Map(
        [...levels].map(([id, row]) => [id, row.stocked - row.reserved - row.held_by_others])
      )
      const { hold_minutes } = await stockSettingsOf(container)
      const expiresAt = new Date(Date.now() + hold_minutes * 60_000)
      const held: HoldRow[] = []

      for (const item of items) {
        const variant = variants.find((row) => row.id === item!.variant_id)
        const links = (variant?.inventory_items ?? []).filter(Boolean)

        if (!variant?.manage_inventory || !links.length) {
          continue
        }

        let units = Number(item!.quantity)

        for (const link of links) {
          const required = Number(link!.required_quantity ?? 1) || 1
          const left = Math.max(free.get(link!.inventory_item_id) ?? 0, 0)

          units = Math.min(units, Math.floor(left / required))
        }

        if (units <= 0) {
          continue
        }

        for (const link of links) {
          const required = Number(link!.required_quantity ?? 1) || 1
          const id = link!.inventory_item_id

          free.set(id, (free.get(id) ?? 0) - units * required)
          held.push({
            cart_id: input.cart_id,
            line_item_id: item!.id,
            variant_id: variant.id,
            inventory_item_id: id,
            quantity: units * required,
            expires_at: expiresAt,
          })
        }
      }

      if (held.length) {
        await stock.createStockHolds(held)
      }

      return { held, undo }
    })

    return new StepResponse({ held }, undo)
  },
  undoHolds
)

export const releaseCartHoldsStep = createStep(
  "release-cart-holds",
  async (input: { cart_id: string }, { container }) => {
    const stock = stockOf(container)
    const previous = await stock.listStockHolds({ cart_id: input.cart_id }, { take: null })

    if (previous.length) {
      await stock.deleteStockHolds(previous.map((hold) => hold.id))
    }

    return new StepResponse(
      { released: previous.length },
      { cart_id: input.cart_id, previous: previous.map(copy) } as HoldsUndo
    )
  },
  undoHolds
)

// Expired holds no longer count anywhere; this only keeps the table small.
export const pruneStockHoldsStep = createStep(
  "prune-stock-holds",
  async (input: { before: Date }, { container }) => {
    const stock = stockOf(container)
    const expired = await stock.listStockHolds(
      { expires_at: { $lte: input.before } },
      { take: 1000, select: ["id"] }
    )

    if (expired.length) {
      await stock.deleteStockHolds(expired.map((hold) => hold.id))
    }

    return new StepResponse({ deleted: expired.length })
  }
)
