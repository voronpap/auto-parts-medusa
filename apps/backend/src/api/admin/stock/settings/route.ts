import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { STOCK_MODULE } from "../../../../modules/stock"
import StockModuleService from "../../../../modules/stock/service"
import { updateStockSettingsWorkflow } from "../../../../workflows/stock"
import { stockSettingsOf } from "../../../../workflows/stock/availability"
import { UpdateStockSettingsBody } from "../middlewares"

type VariantRow = {
  id: string
  sku: string | null
  title: string
  product?: { title: string } | null
}

/** The stock settings and the carts holding parts right now. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const stock = req.scope.resolve<StockModuleService>(STOCK_MODULE)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const settings = await stockSettingsOf(req.scope)
  const holds = await stock.listStockHolds(
    { expires_at: { $gt: new Date() } },
    { order: { expires_at: "ASC" }, take: 200 }
  )
  const variantIds = [...new Set(holds.map((hold) => hold.variant_id))]
  const { data: variants } = variantIds.length
    ? await query.graph({
        entity: "product_variant",
        fields: ["id", "sku", "title", "product.title"],
        filters: { id: variantIds },
      })
    : { data: [] }
  const byId = new Map<string, VariantRow>(
    (variants as VariantRow[]).map((variant) => [variant.id, variant])
  )

  return res.status(200).json({
    settings: {
      hold_minutes: settings.hold_minutes,
      backorder_label: settings.backorder_label,
    },
    holds: holds.map((hold) => {
      const variant = byId.get(hold.variant_id)

      return {
        id: hold.id,
        cart_id: hold.cart_id,
        variant_id: hold.variant_id,
        title: variant?.product?.title ?? variant?.title ?? hold.variant_id,
        sku: variant?.sku ?? null,
        quantity: hold.quantity,
        expires_at: hold.expires_at,
      }
    }),
  })
}

export async function POST(
  req: AuthenticatedMedusaRequest<UpdateStockSettingsBody>,
  res: MedusaResponse
) {
  await updateStockSettingsWorkflow(req.scope).run({ input: req.validatedBody })

  return res.status(200).json({ updated: true })
}
