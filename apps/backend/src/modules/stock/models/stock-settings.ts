import { model } from "@medusajs/framework/utils"

// How the shop treats its stock on the storefront. One row.
const StockSettings = model.define("stock_settings", {
  id: model.id({ prefix: "stset" }).primaryKey(),
  // How long a cart keeps the units it holds after its last change.
  hold_minutes: model.number().default(15),
  // What the storefront says about a part that is not on the shelf but is
  // still accepted, e.g. "Під замовлення, 3-7 днів".
  backorder_label: model.text().default("Під замовлення"),
})

export default StockSettings
