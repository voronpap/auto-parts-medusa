import { model } from "@medusajs/framework/utils"

// A markup that replaces the default one for a brand, a range of purchase
// prices, or both. The most specific matching rule wins.
const PricingRule = model
  .define("supply_pricing_rule", {
    id: model.id({ prefix: "suprule" }).primaryKey(),
    brand: model.text().nullable(),
    normalized_brand: model.text().nullable(),
    // Purchase price range in minor units; an empty bound is open.
    price_from_minor: model.number().nullable(),
    price_to_minor: model.number().nullable(),
    markup_bp: model.number(),
  })
  .indexes([
    {
      on: ["normalized_brand"],
      where: "deleted_at IS NULL",
    },
  ])

export default PricingRule
