import { MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { PARTS_CATALOG_MODULE } from "../../../modules/parts-catalog"
import {
  ApplicabilityVerdict,
  RelationType,
  RelationshipState,
} from "../../../modules/parts-catalog/constants"
import PartsCatalogModuleService from "../../../modules/parts-catalog/service"
import {
  defaultRelationshipState,
  getVerdictViolation,
} from "../../../modules/parts-catalog/utils/verdict"

export type RelationshipEvidenceInput = {
  source_id: string
  record_ref?: string | null
  url?: string | null
  catalog_version?: string | null
  parser_version?: string | null
  retrieved_at?: string | null
  raw_relation_text?: string | null
  source_semantics?: string | null
}

export type CreatePartRelationshipInput = {
  from_part_number_id: string
  to_part_number_id?: string | null
  relation_type: RelationType
  relationship_state?: RelationshipState
  applicability_verdict?: ApplicabilityVerdict
  constraints?: Record<string, unknown> | null
  reason?: string | null
  valid_from?: string | null
  valid_to?: string | null
  evidence?: RelationshipEvidenceInput[]
}

type Created = {
  relationship_id: string
  observation_ids: string[]
}

export const createPartRelationshipStep = createStep(
  "create-part-relationship",
  async (input: CreatePartRelationshipInput, { container }) => {
    const catalog = container.resolve<PartsCatalogModuleService>(
      PARTS_CATALOG_MODULE
    )
    const evidence = input.evidence ?? []
    const toId = input.to_part_number_id || null
    const isTerminal = input.relation_type === "DISCONTINUED_NO_REPLACEMENT"

    if (isTerminal && toId) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "DISCONTINUED_NO_REPLACEMENT has no target part number"
      )
    }

    if (!isTerminal && !toId) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `${input.relation_type} needs a target part number`
      )
    }

    if (toId === input.from_part_number_id) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "A part number cannot be related to itself"
      )
    }

    await catalog.retrievePartNumber(input.from_part_number_id)

    if (toId) {
      await catalog.retrievePartNumber(toId)
    }

    const sourceIds = [...new Set(evidence.map((item) => item.source_id))]
    const sources = sourceIds.length
      ? await catalog.listSources({ id: sourceIds })
      : []
    const sourceById = new Map(sources.map((source) => [source.id, source]))
    const missingSource = sourceIds.find((id) => !sourceById.has(id))

    if (missingSource) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Source ${missingSource} was not found`
      )
    }

    const verdict = input.applicability_verdict ?? "UNRESOLVED"
    const violation = getVerdictViolation({
      verdict,
      relation_type: input.relation_type,
      reason: input.reason,
      evidence: evidence.map((item) => {
        const source = sourceById.get(item.source_id)!

        return {
          source_kind: source.kind,
          lineage: source.lineage,
          status: "active" as const,
        }
      }),
    })

    if (violation) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, violation)
    }

    const duplicates = await catalog.listPartRelationships({
      from_part_number_id: input.from_part_number_id,
      to_part_number_id: toId,
      relation_type: input.relation_type,
    })

    if (duplicates.length) {
      throw new MedusaError(
        MedusaError.Types.DUPLICATE_ERROR,
        "This relationship already exists; add evidence to it instead"
      )
    }

    const relationship = await catalog.createPartRelationships({
      from_part_number_id: input.from_part_number_id,
      to_part_number_id: toId,
      relation_type: input.relation_type,
      relationship_state:
        input.relationship_state ??
        defaultRelationshipState(input.relation_type),
      applicability_verdict: verdict,
      constraints: input.constraints ?? null,
      reason: input.reason?.trim() || null,
      valid_from: input.valid_from ? new Date(input.valid_from) : null,
      valid_to: input.valid_to ? new Date(input.valid_to) : null,
    })
    const created: Created = {
      relationship_id: relationship.id,
      observation_ids: [],
    }

    for (const item of evidence) {
      const observation = await catalog.createObservations({
        source_id: item.source_id,
        record_ref: item.record_ref?.trim() || null,
        url: item.url?.trim() || null,
        catalog_version: item.catalog_version?.trim() || null,
        parser_version: item.parser_version?.trim() || null,
        retrieved_at: item.retrieved_at
          ? new Date(item.retrieved_at)
          : new Date(),
        status: "active",
      })
      created.observation_ids.push(observation.id)

      await catalog.createRelationshipEvidences({
        relationship_id: relationship.id,
        observation_id: observation.id,
        raw_relation_text: item.raw_relation_text?.trim() || null,
        source_semantics: item.source_semantics?.trim() || null,
      })
    }

    return new StepResponse(relationship, created)
  },
  async (created: Created | undefined, { container }) => {
    if (!created) {
      return
    }

    const catalog = container.resolve<PartsCatalogModuleService>(
      PARTS_CATALOG_MODULE
    )

    // Evidence rows go with the relationship; observations are separate.
    await catalog.deletePartRelationships(created.relationship_id)

    if (created.observation_ids.length) {
      await catalog.deleteObservations(created.observation_ids)
    }
  }
)
