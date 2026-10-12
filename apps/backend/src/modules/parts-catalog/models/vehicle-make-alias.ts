import { model } from "@medusajs/framework/utils"
import VehicleMake from "./vehicle-make"

const VehicleMakeAlias = model
  .define("vehicle_make_alias", {
    id: model.id({ prefix: "vmalias" }).primaryKey(),
    alias: model.text(),
    normalized_alias: model.text(),
    make: model.belongsTo(() => VehicleMake, { mappedBy: "aliases" }),
  })
  .indexes([
    {
      on: ["normalized_alias"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ])

export default VehicleMakeAlias
