import {
  MiddlewareRoute,
  validateAndTransformQuery,
} from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { SECURITY_EVENT_CATEGORIES } from "../../../../modules/security/event-types"

export const GetSecurityEventsSchema = z.object({
  limit: z.preprocess(
    (value) => (typeof value === "string" ? Number.parseInt(value, 10) : value),
    z.number().int().min(1).max(100).default(50)
  ),
  offset: z.preprocess(
    (value) => (typeof value === "string" ? Number.parseInt(value, 10) : value),
    z.number().int().min(0).default(0)
  ),
  type: z.string().min(1).max(64).optional(),
  severity: z.string().min(1).max(32).optional(),
  category: z.enum(SECURITY_EVENT_CATEGORIES).optional(),
  ip: z.string().min(2).max(64).optional(),
})

export type GetSecurityEventsQuery = z.infer<typeof GetSecurityEventsSchema>

export const securityEventsMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/admin/security/events",
    method: "GET",
    middlewares: [
      validateAndTransformQuery(GetSecurityEventsSchema, {
        isList: true,
      }),
    ],
  },
]
