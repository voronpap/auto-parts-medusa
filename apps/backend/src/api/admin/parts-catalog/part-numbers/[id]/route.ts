import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { PARTS_CATALOG_MODULE } from "../../../../../modules/parts-catalog"
import PartsCatalogModuleService from "../../../../../modules/parts-catalog/service"
import {
  countIndependentConfirmations,
  EvidenceSummary,
} from "../../../../../modules/parts-catalog/utils/verdict"
import { deletePartNumberWorkflow } from "../../../../../workflows/parts-catalog"

const MAX_CHAIN_LENGTH = 20

const EVIDENCE_RELATIONS = [
  "evidence",
  "evidence.observation",
  "evidence.observation.source",
]

type LoadedEvidence = {
  observation?: {
    status: EvidenceSummary["status"]
    source?: {
      kind: EvidenceSummary["source_kind"]
      lineage: string
    } | null
  } | null
}

function withConfirmations<T extends { evidence?: LoadedEvidence[] | null }>(
  relationship: T
) {
  const evidence = (relationship.evidence ?? []).flatMap((item) =>
    item.observation?.source
      ? [
          {
            source_kind: item.observation.source.kind,
            lineage: item.observation.source.lineage,
            status: item.observation.status,
          },
        ]
      : []
  )

  return {
    ...relationship,
    independent_confirmations: countIndependentConfirmations(evidence),
  }
}

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const catalog = req.scope.resolve<PartsCatalogModuleService>(
    PARTS_CATALOG_MODULE
  )
  const { id } = req.params
  const partNumber = await catalog.retrievePartNumber(id, {
    relations: ["brand", "search_keys"],
  })
  const [outgoing, incoming] = await Promise.all([
    catalog.listPartRelationships(
      { from_part_number_id: id },
      {
        relations: [
          "to_part_number",
          "to_part_number.brand",
          ...EVIDENCE_RELATIONS,
        ],
        order: { created_at: "ASC" },
      }
    ),
    catalog.listPartRelationships(
      { to_part_number_id: id },
      {
        relations: [
          "from_part_number",
          "from_part_number.brand",
          ...EVIDENCE_RELATIONS,
        ],
        order: { created_at: "ASC" },
      }
    ),
  ])

  // Follow SUPERSEDED_BY forward to the current number. A number replaced by
  // several successors ends the chain here; they are listed as relationships.
  const supersessionChain = [partNumber]
  const seen = new Set([id])
  let currentId = id

  while (supersessionChain.length < MAX_CHAIN_LENGTH) {
    const next = await catalog.listPartRelationships(
      { from_part_number_id: currentId, relation_type: "SUPERSEDED_BY" },
      { relations: ["to_part_number", "to_part_number.brand"], take: 2 }
    )
    const successor = next.length === 1 ? next[0].to_part_number : null

    if (!successor || seen.has(successor.id)) {
      break
    }

    supersessionChain.push(successor)
    seen.add(successor.id)
    currentId = successor.id
  }

  return res.status(200).json({
    part_number: partNumber,
    outgoing: outgoing.map(withConfirmations),
    incoming: incoming.map(withConfirmations),
    supersession_chain: supersessionChain,
  })
}

export async function DELETE(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const { id } = req.params

  await deletePartNumberWorkflow(req.scope).run({ input: { id } })

  return res.status(200).json({ id, object: "part_number", deleted: true })
}
