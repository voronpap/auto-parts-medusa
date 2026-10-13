import { model } from "@medusajs/framework/utils"

// How purchase prices of suppliers become shop prices. One row.
const PricingSettings = model.define("supply_pricing_settings", {
  id: model.id({ prefix: "suppr" }).primaryKey(),
  // Markup in hundredths of a percent (2500 = 25%). Empty until the owner
  // sets it: prices are never calculated from a number nobody chose.
  default_markup_bp: model.number().nullable(),
  // Shop prices are rounded up to this step, in minor units (100 = 1 UAH).
  rounding_minor: model.number().default(100),
  // Whether a supplier's stock is shown as the product's availability.
  sync_stock: model.boolean().default(true),
  // What the last recalculation did.
  last_applied_at: model.dateTime().nullable(),
  last_result: model.json().nullable(),
})

export default PricingSettings
