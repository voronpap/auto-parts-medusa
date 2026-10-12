import { model } from "@medusajs/framework/utils"
import VehicleModel from "./vehicle-model"

// The same alias may exist under different makes, so it is unique per model
// and looked up within a make.
const VehicleModelAlias = model
  .define("vehicle_model_alias", {
    id: model.id({ prefix: "vmoalias" }).primaryKey(),
    alias: model.text(),
    normalized_alias: model.text(),
    model: model.belongsTo(() => VehicleModel, { mappedBy: "aliases" }),
  })
  .indexes([
    {
      on: ["model_id", "normalized_alias"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    {
      on: ["normalized_alias"],
      where: "deleted_at IS NULL",
    },
  ])

export default VehicleModelAlias
