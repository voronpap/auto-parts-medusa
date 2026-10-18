import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { BACKORDER_KEY } from "../../../../../workflows/stock/steps/order-backorders"

/** Per line of an order: how much is reserved, on backorder, shipped. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const inventory = req.scope.resolve(Modules.INVENTORY)
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "status",
      "items.id",
      "items.title",
      "items.product_title",
      "items.variant_sku",
      "items.metadata",
      "items.detail.quantity",
      "items.detail.fulfilled_quantity",
    ],
    filters: { id: req.params.id },
  })
  const items = (data[0]?.items ?? []).filter(Boolean)
  const reservations = items.length
    ? await inventory.listReservationItems(
        { line_item_id: items.map((item) => item!.id) },
        { take: null }
      )
    : []
  const locationIds = [...new Set(reservations.map((row) => row.location_id))]
  const { data: locations } = locationIds.length
    ? await query.graph({
        entity: "stock_location",
        fields: ["id", "name"],
        filters: { id: locationIds },
      })
    : { data: [] }
  const locationName = new Map<string, string>(
    (locations as { id: string; name: string }[]).map((row) => [row.id, row.name])
  )

  return res.status(200).json({
    items: items.map((item) => {
      const rows = reservations.filter((row) => row.line_item_id === item!.id)

      return {
        id: item!.id,
        title: item!.product_title || item!.title,
        sku: item!.variant_sku ?? null,
        quantity: Number(
          (item as { detail?: { quantity?: number } }).detail?.quantity ?? item!.quantity ?? 0
        ),
        fulfilled_quantity: Number(
          (item as { detail?: { fulfilled_quantity?: number } }).detail?.fulfilled_quantity ?? 0
        ),
        backorder_quantity: Number(
          ((item!.metadata ?? {}) as Record<string, unknown>)[BACKORDER_KEY] ?? 0
        ),
        reservations: rows.map((row) => ({
          id: row.id,
          quantity: Number(row.quantity),
          location: locationName.get(row.location_id) ?? row.location_id,
        })),
      }
    }),
  })
}
