import { model } from "@medusajs/framework/utils"
import PartNumber from "./part-number"

// A separate table rather than an array column, so exact and prefix lookups
// by number use an index.
const PartNumberSearchKey = model
  .define("part_number_search_key", {
    id: model.id({ prefix: "pnkey" }).primaryKey(),
    key: model.text(),
    part_number: model.belongsTo(() => PartNumber, { mappedBy: "search_keys" }),
  })
  .indexes([
    {
      on: ["key"],
      where: "deleted_at IS NULL",
    },
    {
      on: ["part_number_id", "key"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ])

export default PartNumberSearchKey
