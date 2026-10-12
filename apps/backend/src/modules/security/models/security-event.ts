import { model } from "@medusajs/framework/utils"

const SecurityEvent = model.define("security_event", {
  id: model.id().primaryKey(),
  type: model.text(),
  severity: model.text(),
  source: model.text(),
  ip: model.text().nullable(),
  method: model.text().nullable(),
  path: model.text().nullable(),
  status: model.number().nullable(),
  request_id: model.text().nullable(),
  actor_id: model.text().nullable(),
  metadata: model.json().nullable(),
}).indexes([
  {
    on: ["created_at"],
  },
  {
    on: ["type", "created_at"],
  },
])

export default SecurityEvent
