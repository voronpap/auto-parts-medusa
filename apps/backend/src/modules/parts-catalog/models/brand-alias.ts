import { model } from "@medusajs/framework/utils"
import Brand from "./brand"

const BrandAlias = model
  .define("parts_brand_alias", {
    id: model.id({ prefix: "pbalias" }).primaryKey(),
    alias: model.text(),
    // An alias resolves to exactly one brand.
    normalized_alias: model.text(),
    brand: model.belongsTo(() => Brand, { mappedBy: "aliases" }),
  })
  .indexes([
    {
      on: ["normalized_alias"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ])

export default BrandAlias
