import { model } from "@medusajs/framework/utils"
import OfferObservation from "./offer-observation"
import Supplier from "./supplier"

// What a supplier offers for one part number now: price, stock, lead time.
// An offer is not a product of the store; the parts catalog number it refers
// to is kept as a plain id, because the two modules stay independent.
const SupplierOffer = model
  .define("supply_offer", {
    id: model.id({ prefix: "supoff" }).primaryKey(),
    supplier: model.belongsTo(() => Supplier, { mappedBy: "offers" }),
    // Brand and number exactly as the price list writes them.
    brand: model.text(),
    number: model.text().searchable(),
    normalized_brand: model.text(),
    normalized_number: model.text(),
    part_number_id: model.text().nullable(),
    title: model.text().nullable(),
    // Money in minor units (kopecks), never a float.
    price_minor: model.number(),
    currency_code: model.text(),
    // Empty when the list only says "in stock" or nothing at all.
    stock_quantity: model.number().nullable(),
    stock_text: model.text().nullable(),
    lead_days: model.number().nullable(),
    // False once a newer price list no longer has the row.
    is_listed: model.boolean().default(true),
    last_run_id: model.text().nullable(),
    last_seen_at: model.dateTime(),
    observations: model.hasMany(() => OfferObservation, { mappedBy: "offer" }),
  })
  .indexes([
    {
      on: ["supplier_id", "normalized_brand", "normalized_number"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    {
      on: ["normalized_number"],
      where: "deleted_at IS NULL",
    },
    {
      on: ["part_number_id"],
      where: "deleted_at IS NULL",
    },
  ])

export default SupplierOffer
