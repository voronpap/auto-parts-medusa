import { model } from "@medusajs/framework/utils"
import PartApplication from "./part-application"
import VehicleMake from "./vehicle-make"
import VehicleModelAlias from "./vehicle-model-alias"

const VehicleModel = model
  .define("vehicle_model", {
    id: model.id({ prefix: "vmodel" }).primaryKey(),
    make: model.belongsTo(() => VehicleMake, { mappedBy: "models" }),
    name: model.text().searchable(),
    normalized_name: model.text(),
    needs_review: model.boolean().default(false),
    aliases: model.hasMany(() => VehicleModelAlias, { mappedBy: "model" }),
    applications: model.hasMany(() => PartApplication, {
      mappedBy: "vehicle_model",
    }),
  })
  .cascades({
    delete: ["aliases"],
  })
  .indexes([
    {
      on: ["make_id", "normalized_name"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ])

export default VehicleModel
