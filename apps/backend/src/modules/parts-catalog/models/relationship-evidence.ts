import { model } from "@medusajs/framework/utils"
import Observation from "./observation"
import PartRelationship from "./part-relationship"

const RelationshipEvidence = model
  .define("part_relationship_evidence", {
    id: model.id({ prefix: "previd" }).primaryKey(),
    relationship: model.belongsTo(() => PartRelationship, {
      mappedBy: "evidence",
    }),
    observation: model.belongsTo(() => Observation, { mappedBy: "evidence" }),
    // The source's own wording ("replaced by", "interchangeable", "RP"), kept
    // next to the normalized relation type it was mapped to.
    raw_relation_text: model.text().nullable(),
    source_semantics: model.text().nullable(),
  })
  .indexes([
    {
      on: ["relationship_id", "observation_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ])

export default RelationshipEvidence
