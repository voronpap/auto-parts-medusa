import { model } from "@medusajs/framework/utils"

// A response of a source exactly as it was received: the page, the JSON, the
// text of a PDF page. Parsed facts can always be rebuilt from it, also by a
// later, better parser, without asking the source again.
//
// A new row is written only when the content differs from what is already
// kept for the same request, so the archive holds every version a source has
// shown and nothing twice. It refers to the part number and the source by
// plain values, not relations: the archive outlives the records around it.
const SourceDocument = model
  .define("parts_source_document", {
    id: model.id({ prefix: "pdoc" }).primaryKey(),
    source_key: model.text(),
    source_name: model.text().nullable(),
    parser_name: model.text().nullable(),
    parser_version: model.text().nullable(),
    // The number that was being looked up, as asked and as found in the catalog.
    brand: model.text().nullable(),
    number: model.text().nullable(),
    part_number_id: model.text().nullable(),
    // Identifies the request: method, address and parameters.
    request_key: model.text(),
    method: model.text().default("GET"),
    url: model.text(),
    params: model.json().nullable(),
    http_status: model.number().nullable(),
    body: model.text(),
    body_sha256: model.text(),
    body_bytes: model.number(),
    fetched_at: model.dateTime(),
    last_seen_at: model.dateTime(),
  })
  .indexes([
    {
      on: ["request_key", "body_sha256"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    {
      on: ["part_number_id"],
      where: "deleted_at IS NULL",
    },
    {
      on: ["source_key", "fetched_at"],
      where: "deleted_at IS NULL",
    },
  ])

export default SourceDocument
