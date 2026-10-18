import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { STOCK_MODULE } from "../../modules/stock"
import StockModuleService from "../../modules/stock/service"

type Resolver = Pick<MedusaContainer, "resolve">

export const DEFAULT_HOLD_MINUTES = 15
export const DEFAULT_BACKORDER_LABEL = "Під замовлення"

export async function stockSettingsOf(container: Resolver) {
  const stock = container.resolve<StockModuleService>(STOCK_MODULE)
  const [settings] = await stock.listStockSettings({}, { take: 1 })

  return {
    id: settings?.id ?? null,
    hold_minutes: settings?.hold_minutes ?? DEFAULT_HOLD_MINUTES,
    backorder_label: settings?.backorder_label || DEFAULT_BACKORDER_LABEL,
  }
}

// What the shop has of one inventory item at the locations that sell to the
// shopper, in units of the item.
export type ItemStock = {
  stocked: number
  reserved: number
  // Active holds of carts other than the one asking.
  held_by_others: number
  held_by_others_until: Date | null
  // Active holds of the asking cart.
  held_by_cart: number
  held_by_cart_until: Date | null
}

export type VariantStock = {
  variant_id: string
  manage_inventory: boolean
  allow_backorder: boolean
  // Units the asking shopper can still buy from the shelf: stock less
  // reservations of orders and holds of other carts. The shopper's own hold
  // does not make it smaller.
  available: number
  held_by_others: number
  held_by_others_until: string | null
  held_by_cart: number
  held_by_cart_until: string | null
  inventory: { inventory_item_id: string; required_quantity: number }[]
}

type VariantRow = {
  id: string
  manage_inventory: boolean | null
  allow_backorder: boolean | null
  inventory_items?: {
    inventory_item_id: string
    required_quantity: number | null
    inventory?: {
      location_levels?: {
        location_id: string
        stocked_quantity: number | null
        reserved_quantity: number | null
      }[]
    }
  }[]
}

export async function salesChannelLocations(
  container: Resolver,
  salesChannelIds: string[]
): Promise<Set<string> | null> {
  if (!salesChannelIds.length) {
    return null
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "sales_channel",
    fields: ["id", "stock_locations.id"],
    filters: { id: salesChannelIds },
  })

  return new Set(
    data.flatMap((channel) =>
      (channel.stock_locations ?? []).flatMap((location) => (location ? [location.id] : []))
    )
  )
}

export async function itemStock(
  container: Resolver,
  input: {
    levels: Map<string, { stocked: number; reserved: number }>
    cart_id?: string | null
    now?: Date
  }
): Promise<Map<string, ItemStock>> {
  const stock = container.resolve<StockModuleService>(STOCK_MODULE)
  const ids = [...input.levels.keys()]
  const result = new Map<string, ItemStock>()

  for (const [id, level] of input.levels) {
    result.set(id, {
      ...level,
      held_by_others: 0,
      held_by_others_until: null,
      held_by_cart: 0,
      held_by_cart_until: null,
    })
  }

  if (!ids.length) {
    return result
  }

  const holds = await stock.listStockHolds(
    {
      inventory_item_id: ids,
      expires_at: { $gt: input.now ?? new Date() },
    },
    { take: null }
  )

  for (const hold of holds) {
    const row = result.get(hold.inventory_item_id)!
    const until = new Date(hold.expires_at)

    if (input.cart_id && hold.cart_id === input.cart_id) {
      row.held_by_cart += hold.quantity
      row.held_by_cart_until =
        !row.held_by_cart_until || until > row.held_by_cart_until ? until : row.held_by_cart_until
    } else {
      row.held_by_others += hold.quantity
      row.held_by_others_until =
        !row.held_by_others_until || until < row.held_by_others_until
          ? until
          : row.held_by_others_until
    }
  }

  return result
}

export function levelsOf(variants: VariantRow[], locations: Set<string> | null) {
  const levels = new Map<string, { stocked: number; reserved: number }>()

  for (const variant of variants) {
    for (const link of variant.inventory_items ?? []) {
      if (levels.has(link.inventory_item_id)) {
        continue
      }

      const level = { stocked: 0, reserved: 0 }

      for (const row of link.inventory?.location_levels ?? []) {
        if (locations && !locations.has(row.location_id)) {
          continue
        }

        level.stocked += Number(row.stocked_quantity ?? 0)
        level.reserved += Number(row.reserved_quantity ?? 0)
      }

      levels.set(link.inventory_item_id, level)
    }
  }

  return levels
}

export const VARIANT_STOCK_FIELDS = [
  "id",
  "manage_inventory",
  "allow_backorder",
  "inventory_items.inventory_item_id",
  "inventory_items.required_quantity",
  "inventory_items.inventory.location_levels.location_id",
  "inventory_items.inventory.location_levels.stocked_quantity",
  "inventory_items.inventory.location_levels.reserved_quantity",
]

export async function variantStock(
  container: Resolver,
  input: {
    variant_ids: string[]
    cart_id?: string | null
    sales_channel_ids?: string[]
  }
): Promise<VariantStock[]> {
  if (!input.variant_ids.length) {
    return []
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: variants } = await query.graph({
    entity: "product_variant",
    fields: VARIANT_STOCK_FIELDS,
    filters: { id: input.variant_ids },
  })
  const locations = await salesChannelLocations(container, input.sales_channel_ids ?? [])
  const items = await itemStock(container, {
    levels: levelsOf(variants as VariantRow[], locations),
    cart_id: input.cart_id,
  })

  return (variants as VariantRow[]).map((variant) => {
    const links = (variant.inventory_items ?? []).map((link) => ({
      inventory_item_id: link.inventory_item_id,
      required_quantity: Number(link.required_quantity ?? 1) || 1,
    }))
    let available = Number.POSITIVE_INFINITY
    let heldByOthers = Number.POSITIVE_INFINITY
    let heldByCart = Number.POSITIVE_INFINITY
    let othersUntil: Date | null = null
    let cartUntil: Date | null = null

    for (const link of links) {
      const row = items.get(link.inventory_item_id)!
      const free = row.stocked - row.reserved - row.held_by_others

      available = Math.min(available, Math.floor(Math.max(free, 0) / link.required_quantity))
      heldByOthers = Math.min(heldByOthers, Math.floor(row.held_by_others / link.required_quantity))
      heldByCart = Math.min(heldByCart, Math.floor(row.held_by_cart / link.required_quantity))
      othersUntil = row.held_by_others_until ?? othersUntil
      cartUntil = row.held_by_cart_until ?? cartUntil
    }

    const managed = Boolean(variant.manage_inventory) && links.length > 0

    return {
      variant_id: variant.id,
      manage_inventory: managed,
      allow_backorder: Boolean(variant.allow_backorder),
      available: managed ? available : 0,
      held_by_others: managed ? heldByOthers : 0,
      held_by_others_until: managed && heldByOthers > 0 ? othersUntil?.toISOString() ?? null : null,
      held_by_cart: managed ? heldByCart : 0,
      held_by_cart_until: managed && heldByCart > 0 ? cartUntil?.toISOString() ?? null : null,
      inventory: links,
    }
  })
}
