import { configureStoreSearch, defineMiddlewares } from "@medusajs/framework/http"
import { securityMiddleware } from "../modules/security/http/security-middleware"
import { partsCatalogMiddlewares } from "./admin/parts-catalog/middlewares"
import { securityEventsMiddlewares } from "./admin/security/events/middlewares"
import { supplyMiddlewares } from "./admin/supply/middlewares"

// The product index declares filterable `status` and `sales_channel_ids`, so
// the route narrows it to published products in the key's sales channels.
export default defineMiddlewares({
  routes: [
    {
      matcher: /^\/.*$/,
      middlewares: [securityMiddleware],
    },
    {
      method: ["POST"],
      matcher: "/store/search",
      middlewares: [
        configureStoreSearch({
          allowed_indexes: {
            product: true,
          },
        }),
      ],
    },
    ...securityEventsMiddlewares,
    ...partsCatalogMiddlewares,
    ...supplyMiddlewares,
  ],
})
