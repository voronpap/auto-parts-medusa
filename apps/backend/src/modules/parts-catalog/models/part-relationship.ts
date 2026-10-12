import { model } from "@medusajs/framework/utils"
import {
  APPLICABILITY_VERDICTS,
  RELATION_TYPES,
  RELATIONSHIP_STATES,
} from "../constants"
import PartNumber from "./part-number"
import RelationshipEvidence from "./relationship-evidence"

// A directed, typed claim about two part numbers. The claim's own status
// (relationship_state) is independent of whether the part fits
// (applicability_verdict): a manufacturer can assert a cross that is still
// only conditionally applicable.
const PartRelationship = model
  .define("part_relationship", {
    id: model.id({ prefix: "prel" }).primaryKey(),
    from_part_number: model.belongsTo(() => PartNumber, {
      mappedBy: "outgoing_relationships",
    }),
    // Empty only for DISCONTINUED_NO_REPLACEMENT.
    to_part_number: model
      .belongsTo(() => PartNumber, {
        mappedBy: "incoming_relationships",
      })
      .nullable(),
    relation_type: model.enum([...RELATION_TYPES]),
    relationship_state: model.enum([...RELATIONSHIP_STATES]).default("ASSERTED"),
    applicability_verdict: model
      .enum([...APPLICABILITY_VERDICTS])
      .default("UNRESOLVED"),
    // Conditions under which the claim holds (VIN range, dates, trim, side).
    constraints: model.json().nullable(),
    // Why the part does not fit, for negative and rejected relations.
    reason: model.text().nullable(),
    valid_from: model.dateTime().nullable(),
    valid_to: model.dateTime().nullable(),
    evidence: model.hasMany(() => RelationshipEvidence, {
      mappedBy: "relationship",
    }),
  })
  .cascades({
    delete: ["evidence"],
  })
  .indexes([
    {
      on: ["from_part_number_id", "relation_type"],
      where: "deleted_at IS NULL",
    },
    {
      on: ["to_part_number_id", "relation_type"],
      where: "deleted_at IS NULL",
    },
  ])

export default PartRelationship
