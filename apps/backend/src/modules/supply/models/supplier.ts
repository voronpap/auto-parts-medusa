import { model } from "@medusajs/framework/utils"
import ImportRun from "./import-run"
import SupplierOffer from "./supplier-offer"

// Someone the store buys from: a wholesaler with a price list.
const Supplier = model
  .define("supply_supplier", {
    id: model.id({ prefix: "sup" }).primaryKey(),
    name: model.text().searchable(),
    // Lookup key built like a brand name: one supplier per key.
    normalized_name: model.text(),
    // Currency of the supplier's price list.
    currency_code: model.text().default("uah"),
    // Days from order to arrival, when the price list does not say per row.
    lead_days: model.number().nullable(),
    note: model.text().nullable(),
    is_active: model.boolean().default(true),
    offers: model.hasMany(() => SupplierOffer, { mappedBy: "supplier" }),
    import_runs: model.hasMany(() => ImportRun, { mappedBy: "supplier" }),
  })
  .indexes([
    {
      on: ["normalized_name"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ])

export default Supplier
