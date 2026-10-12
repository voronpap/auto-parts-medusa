import { model } from "@medusajs/framework/utils"
import { LICENSE_CLASSES, SOURCE_KINDS } from "../constants"
import Observation from "./observation"

const Source = model
  .define("parts_source", {
    id: model.id({ prefix: "psrc" }).primaryKey(),
    name: model.text().searchable(),
    kind: model.enum([...SOURCE_KINDS]),
    license_class: model.enum([...LICENSE_CLASSES]),
    // Upstream the data ultimately comes from. Sources sharing a lineage count
    // as one independent confirmation, however many of them agree.
    lineage: model.text(),
    url: model.text().nullable(),
    license_note: model.text().nullable(),
    observations: model.hasMany(() => Observation, { mappedBy: "source" }),
  })
  .indexes([
    {
      on: ["name"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    {
      on: ["lineage"],
      where: "deleted_at IS NULL",
    },
  ])

export default Source
