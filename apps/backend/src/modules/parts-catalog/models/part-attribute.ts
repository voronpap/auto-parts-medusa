import { model } from "@medusajs/framework/utils"
import Observation from "./observation"
import PartNumber from "./part-number"

// A technical characteristic of a part as stated by a source.
const PartAttribute = model
  .define("part_attribute", {
    id: model.id({ prefix: "pattr" }).primaryKey(),
    part_number: model.belongsTo(() => PartNumber, {
      mappedBy: "attributes",
    }),
    observation: model.belongsTo(() => Observation, {
      mappedBy: "attributes",
    }),
    name: model.text(),
    value: model.text(),
    unit: model.text().nullable(),
    raw_text: model.text().nullable(),
  })
  .indexes([
    {
      on: ["part_number_id"],
      where: "deleted_at IS NULL",
    },
  ])

export default PartAttribute
