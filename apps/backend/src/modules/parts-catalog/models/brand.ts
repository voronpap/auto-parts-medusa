import { model } from "@medusajs/framework/utils"
import { BRAND_KINDS } from "../constants"
import BrandAlias from "./brand-alias"
import PartNumber from "./part-number"

const Brand = model
  .define("parts_brand", {
    id: model.id({ prefix: "pbrand" }).primaryKey(),
    name: model.text().searchable(),
    // Lookup key built by normalizeBrandName; one brand per key.
    normalized_name: model.text(),
    kind: model.enum([...BRAND_KINDS]).default("parts_manufacturer"),
    aliases: model.hasMany(() => BrandAlias, { mappedBy: "brand" }),
    part_numbers: model.hasMany(() => PartNumber, { mappedBy: "brand" }),
  })
  .cascades({
    delete: ["aliases"],
  })
  .indexes([
    {
      on: ["normalized_name"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ])

export default Brand
