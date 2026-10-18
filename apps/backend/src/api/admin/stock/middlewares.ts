import { MiddlewareRoute, validateAndTransformBody } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"

export const UpdateStockSettingsSchema = z.object({
  hold_minutes: z.number().int().min(1).max(24 * 60).optional(),
  backorder_label: z.string().trim().min(1).max(120).optional(),
})

export type UpdateStockSettingsBody = z.infer<typeof UpdateStockSettingsSchema>

export const stockMiddlewares: MiddlewareRoute[] = [
  {
    method: ["POST"],
    matcher: "/admin/stock/settings",
    middlewares: [validateAndTransformBody(UpdateStockSettingsSchema)],
  },
]
