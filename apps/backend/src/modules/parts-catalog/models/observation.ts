import { model } from "@medusajs/framework/utils"
import { OBSERVATION_STATUSES } from "../constants"
import PartApplication from "./part-application"
import PartAttribute from "./part-attribute"
import RelationshipEvidence from "./relationship-evidence"
import Source from "./source"

// One thing a source said, with enough provenance to find it again and to
// know which parser read it.
const Observation = model
  .define("parts_observation", {
    id: model.id({ prefix: "pobs" }).primaryKey(),
    source: model.belongsTo(() => Source, { mappedBy: "observations" }),
    record_ref: model.text().nullable(),
    url: model.text().nullable(),
    catalog_version: model.text().nullable(),
    parser_version: model.text().nullable(),
    retrieved_at: model.dateTime(),
    status: model.enum([...OBSERVATION_STATUSES]).default("active"),
    evidence: model.hasMany(() => RelationshipEvidence, {
      mappedBy: "observation",
    }),
    applications: model.hasMany(() => PartApplication, {
      mappedBy: "observation",
    }),
    attributes: model.hasMany(() => PartAttribute, {
      mappedBy: "observation",
    }),
  })
  .indexes([
    {
      on: ["source_id", "status"],
      where: "deleted_at IS NULL",
    },
  ])

export default Observation
