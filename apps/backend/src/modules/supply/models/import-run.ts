import { model } from "@medusajs/framework/utils"
import Supplier from "./supplier"

export const IMPORT_RUN_STATUSES = ["open", "finished"] as const

// One loading of a supplier's price list. Rows arrive in parts; when the run
// is finished, offers the list no longer has are taken off the shelf.
const ImportRun = model.define("supply_import_run", {
  id: model.id({ prefix: "suprun" }).primaryKey(),
  supplier: model.belongsTo(() => Supplier, { mappedBy: "import_runs" }),
  file_name: model.text().nullable(),
  status: model.enum([...IMPORT_RUN_STATUSES]).default("open"),
  rows_total: model.number().default(0),
  rows_skipped: model.number().default(0),
  offers_created: model.number().default(0),
  offers_updated: model.number().default(0),
  offers_unchanged: model.number().default(0),
  offers_delisted: model.number().default(0),
  // Rows whose number the parts catalog knows.
  offers_matched: model.number().default(0),
  // The first rows that were refused, with the reason.
  errors: model.json().nullable(),
  finished_at: model.dateTime().nullable(),
})

export default ImportRun
