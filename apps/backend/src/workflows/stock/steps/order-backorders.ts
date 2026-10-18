import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import {
  itemStock,
  levelsOf,
  salesChannelLocations,
  VARIANT_STOCK_FIELDS,
} from "../availability"

export const BACKORDER_KEY = "backorder_quantity"

type Metadata = Record<string, unknown> | null

// Says on each line of a new order how many units were not on the shelf when
// it was placed, i.e. are ordered from a supplier. The order's own
// reservation is left out; other carts' holds count as taken.
export const markOrderBackordersStep = createStep(
  "mark-order-backorders",
  async (input: { order_id: string; cart_id?: string | null }, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const inventory = container.resolve(Modules.INVENTORY)
    const orders = container.resolve(Modules.ORDER)
    const { data } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "sales_channel_id",
        "items.id",
        "items.variant_id",
        "items.metadata",
        // An order line's quantity lives in its detail row.
        "items.detail.quantity",
      ],
      filters: { id: input.order_id },
    })
    const order = data[0]
    const items = (order?.items ?? []).filter((item) => item?.variant_id)
    const undo: { id: string; metadata: Metadata }[] = []

    if (!order || !items.length) {
      return new StepResponse({ backordered: 0 }, undo)
    }

    const { data: variants } = await query.graph({
      entity: "product_variant",
      fields: VARIANT_STOCK_FIELDS,
      filters: { id: [...new Set(items.map((item) => item!.variant_id!))] },
    })
    const locations = await salesChannelLocations(
      container,
      order.sales_channel_id ? [order.sales_channel_id] : []
    )
    const levels = await itemStock(container, {
      levels: levelsOf(variants as never, locations),
      cart_id: input.cart_id ?? null,
    })
    const reservations = await inventory.listReservationItems(
      { line_item_id: items.map((item) => item!.id) },
      { take: null }
    )
    const ownReserved = (lineId: string, itemId: string) =>
      reservations
        .filter((row) => row.line_item_id === lineId && row.inventory_item_id === itemId)
        .reduce((sum, row) => sum + Number(row.quantity), 0)
    const updates: {
      selector: { item_id: string }
      data: { metadata: Record<string, unknown> }
    }[] = []
    let backordered = 0

    for (const item of items) {
      const variant = variants.find((row) => row.id === item!.variant_id)
      const links = (variant?.inventory_items ?? []).filter(Boolean)
      const quantity = Number(
        (item as { detail?: { quantity?: number } }).detail?.quantity ?? item!.quantity ?? 0
      )

      if (!variant?.manage_inventory || !links.length) {
        continue
      }

      let onShelf = quantity

      for (const link of links) {
        const id = link!.inventory_item_id
        const row = levels.get(id)!
        const required = Number(link!.required_quantity ?? 1) || 1
        const free =
          row.stocked - (row.reserved - ownReserved(item!.id, id)) - row.held_by_others

        onShelf = Math.min(onShelf, Math.floor(Math.max(free, 0) / required))
      }

      const missing = Math.max(quantity - Math.max(onShelf, 0), 0)
      const metadata = (item!.metadata ?? {}) as Record<string, unknown>

      if (!missing && metadata[BACKORDER_KEY] === undefined) {
        continue
      }

      const next = { ...metadata }

      if (missing) {
        next[BACKORDER_KEY] = missing
        backordered += 1
      } else {
        delete next[BACKORDER_KEY]
      }

      undo.push({ id: item!.id, metadata: (item!.metadata ?? null) as Metadata })
      updates.push({ selector: { item_id: item!.id }, data: { metadata: next } })
    }

    // An order line shows the metadata of its detail row, not of the line.
    if (updates.length) {
      await orders.updateOrderItem(updates)
    }

    return new StepResponse({ backordered }, undo)
  },
  async (undo, { container }) => {
    if (undo?.length) {
      await container.resolve(Modules.ORDER).updateOrderItem(
        undo.map((row) => ({
          selector: { item_id: row.id },
          data: { metadata: row.metadata ?? {} },
        }))
      )
    }
  }
)
