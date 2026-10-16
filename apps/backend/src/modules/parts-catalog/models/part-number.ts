import { model } from "@medusajs/framework/utils"
import { NUMBER_TYPES } from "../constants"
import Brand from "./brand"
import LookupTask from "./lookup-task"
import PartApplication from "./part-application"
import PartAttribute from "./part-attribute"
import PartImage from "./part-image"
import PartNumberSearchKey from "./part-number-search-key"
import PartRelationship from "./part-relationship"

const PartNumber = model
  .define("part_number", {
    id: model.id({ prefix: "pnum" }).primaryKey(),
    brand: model.belongsTo(() => Brand, { mappedBy: "part_numbers" }),
    number_type: model.enum([...NUMBER_TYPES]),
    // Exactly as written in the source it was first seen in.
    source_number: model.text(),
    display_number: model.text().searchable(),
    // Identity key: the same text under another brand or type is another part.
    normalized_number: model.text(),
    search_keys: model.hasMany(() => PartNumberSearchKey, {
      mappedBy: "part_number",
    }),
    outgoing_relationships: model.hasMany(() => PartRelationship, {
      mappedBy: "from_part_number",
    }),
    incoming_relationships: model.hasMany(() => PartRelationship, {
      mappedBy: "to_part_number",
    }),
    applications: model.hasMany(() => PartApplication, {
      mappedBy: "part_number",
    }),
    attributes: model.hasMany(() => PartAttribute, {
      mappedBy: "part_number",
    }),
    images: model.hasMany(() => PartImage, {
      mappedBy: "part_number",
    }),
    lookup_tasks: model.hasMany(() => LookupTask, {
      mappedBy: "part_number",
    }),
  })
  .cascades({
    delete: [
      "search_keys",
      "applications",
      "attributes",
      "images",
      "lookup_tasks",
    ],
  })
  .indexes([
    {
      on: ["brand_id", "number_type", "normalized_number"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ])

export default PartNumber
