import { model } from "@medusajs/framework/utils"

// A question "whose part is this number?" put to the parser service when the
// owner types a number without a brand. The service answers with the parts
// of every brand that its sources list under the number.
const NumberSearch = model
  .define("parts_number_search", {
    id: model.id({ prefix: "pnsrch" }).primaryKey(),
    // As typed.
    query: model.text(),
    normalized_number: model.text(),
    status: model.enum(["pending", "done", "failed"]).default("pending"),
    // [{ brand, number, title, source }]
    candidates: model.json().nullable(),
    errors: model.json().nullable(),
    worker: model.text().nullable(),
    completed_at: model.dateTime().nullable(),
  })
  .indexes([
    {
      on: ["status", "created_at"],
      where: "deleted_at IS NULL",
    },
    {
      on: ["normalized_number"],
      where: "deleted_at IS NULL",
    },
  ])

export default NumberSearch
