import { model } from "@medusajs/framework/utils"
import { PART_IMAGE_STATUSES } from "../constants"
import Observation from "./observation"
import PartNumber from "./part-number"

// A photo a source publishes for a part, kept by its address there. The shop
// makes its own copy (file_url) only when a shopper opens a product with it.
const PartImage = model
  .define("part_image", {
    id: model.id({ prefix: "pimg" }).primaryKey(),
    part_number: model.belongsTo(() => PartNumber, { mappedBy: "images" }),
    observation: model.belongsTo(() => Observation, { mappedBy: "images" }),
    source_url: model.text(),
    // Order the source gives; the first one becomes the product thumbnail.
    position: model.number().default(0),
    status: model.enum([...PART_IMAGE_STATUSES]).default("pending"),
    file_url: model.text().nullable(),
    attempts: model.number().default(0),
    error: model.text().nullable(),
    fetched_at: model.dateTime().nullable(),
  })
  .indexes([
    {
      on: ["part_number_id", "status"],
      where: "deleted_at IS NULL",
    },
  ])

export default PartImage
