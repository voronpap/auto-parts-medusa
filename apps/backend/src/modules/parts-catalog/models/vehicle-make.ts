import { model } from "@medusajs/framework/utils"
import PartApplication from "./part-application"
import VehicleMakeAlias from "./vehicle-make-alias"
import VehicleModel from "./vehicle-model"

const VehicleMake = model
  .define("vehicle_make", {
    id: model.id({ prefix: "vmake" }).primaryKey(),
    name: model.text().searchable(),
    normalized_name: model.text(),
    // Created from parser data rather than by a person; may be a duplicate
    // of an existing make under another spelling.
    needs_review: model.boolean().default(false),
    aliases: model.hasMany(() => VehicleMakeAlias, { mappedBy: "make" }),
    models: model.hasMany(() => VehicleModel, { mappedBy: "make" }),
    applications: model.hasMany(() => PartApplication, {
      mappedBy: "vehicle_make",
    }),
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

export default VehicleMake
