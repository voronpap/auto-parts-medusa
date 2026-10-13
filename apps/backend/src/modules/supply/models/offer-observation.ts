import { model } from "@medusajs/framework/utils"
import SupplierOffer from "./supplier-offer"

// Price history. A row is added when an offer first appears and every time
// its price, stock or listing changes; rows are never edited.
const OfferObservation = model
  .define("supply_offer_observation", {
    id: model.id({ prefix: "supobs" }).primaryKey(),
    offer: model.belongsTo(() => SupplierOffer, { mappedBy: "observations" }),
    price_minor: model.number(),
    currency_code: model.text(),
    stock_quantity: model.number().nullable(),
    is_listed: model.boolean().default(true),
    run_id: model.text().nullable(),
    observed_at: model.dateTime(),
  })
  .indexes([
    {
      on: ["offer_id", "observed_at"],
      where: "deleted_at IS NULL",
    },
  ])

export default OfferObservation
