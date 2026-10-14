import { model } from "@medusajs/framework/utils"

// A shopper who did not find a part asks the shop to pick it by VIN or car.
const PartsRequest = model
  .define("supply_parts_request", {
    id: model.id({ prefix: "preq" }).primaryKey(),
    name: model.text(),
    phone: model.text(),
    vin: model.text().nullable(),
    car: model.text().nullable(),
    message: model.text(),
    status: model.enum(["new", "in_progress", "answered", "closed"]).default("new"),
    // The shop's own notes; never shown to the shopper.
    note: model.text().nullable(),
  })
  .indexes([{ on: ["status", "created_at"], where: "deleted_at IS NULL" }])

export default PartsRequest
