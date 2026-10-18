import { model } from "@medusajs/framework/utils";

const ImportReceipt = model
  .define("parts_import_receipt", {
    id: model.id({ prefix: "pimp" }).primaryKey(),
    idempotency_key: model.text(),
    request_hash: model.text(),
    status: model.enum(["processing", "completed"]).default("processing"),
    response: model.json().nullable(),
    source_file: model.text().nullable(),
    source_offset: model.text().nullable(),
  })
  .indexes([
    {
      on: ["idempotency_key"],
      unique: true,
    },
  ]);

export default ImportReceipt;
