import { model } from "@medusajs/framework/utils"
import { LOOKUP_TASK_STATUSES } from "../constants"
import PartNumber from "./part-number"

// A request for the external parser service to look a number up in its
// sources. The service claims tasks and posts results; the catalog never
// calls it.
const LookupTask = model
  .define("part_lookup_task", {
    id: model.id({ prefix: "plook" }).primaryKey(),
    part_number: model.belongsTo(() => PartNumber, {
      mappedBy: "lookup_tasks",
    }),
    status: model.enum([...LOOKUP_TASK_STATUSES]).default("pending"),
    worker: model.text().nullable(),
    claimed_at: model.dateTime().nullable(),
    completed_at: model.dateTime().nullable(),
    // Counts of what the result added, for display.
    summary: model.json().nullable(),
    errors: model.json().nullable(),
  })
  .indexes([
    {
      on: ["status", "created_at"],
      where: "deleted_at IS NULL",
    },
  ])

export default LookupTask
