import {
  ApplicabilityVerdict,
  CANDIDATE_ONLY_RELATION_TYPES,
  ObservationStatus,
  RelationType,
  RelationshipState,
  SourceKind,
} from "../constants"

export type EvidenceSummary = {
  source_kind: SourceKind
  lineage: string
  status: ObservationStatus
}

// Sources whose claims are hints to verify, never confirmations.
const NON_AUTHORITATIVE_SOURCE_KINDS: readonly SourceKind[] = ["ai"]

const VERDICTS_NEEDING_PROOF: readonly ApplicabilityVerdict[] = [
  "ACCEPTED",
  "CONDITIONAL",
]

function isCandidateOnly(relationType: RelationType): boolean {
  return CANDIDATE_ONLY_RELATION_TYPES.includes(relationType)
}

function authoritativeEvidence(evidence: EvidenceSummary[]): EvidenceSummary[] {
  return evidence.filter(
    (item) =>
      item.status === "active" &&
      !NON_AUTHORITATIVE_SOURCE_KINDS.includes(item.source_kind)
  )
}

/**
 * Number of independent confirmations: active authoritative observations
 * counted once per lineage, so two shops reselling the same database count as
 * one.
 */
export function countIndependentConfirmations(
  evidence: EvidenceSummary[]
): number {
  return new Set(authoritativeEvidence(evidence).map((item) => item.lineage))
    .size
}

export function defaultRelationshipState(
  relationType: RelationType
): RelationshipState {
  return isCandidateOnly(relationType) ? "INFERRED_CANDIDATE" : "ASSERTED"
}

/**
 * Returns why a verdict cannot be given to a relationship, or undefined when
 * it can. Accepted and conditional verdicts need an active observation from an
 * authoritative source, and inferred relation types can never carry them.
 */
export function getVerdictViolation(input: {
  verdict: ApplicabilityVerdict
  relation_type: RelationType
  evidence: EvidenceSummary[]
  reason?: string | null
}): string | undefined {
  const { verdict, relation_type: relationType, evidence, reason } = input

  if (VERDICTS_NEEDING_PROOF.includes(verdict)) {
    if (isCandidateOnly(relationType)) {
      return `${relationType} is an inferred relation and cannot be ${verdict}`
    }

    if (countIndependentConfirmations(evidence) === 0) {
      return `${verdict} requires at least one active observation from an authoritative source`
    }
  }

  if (
    (verdict === "REJECTED" || relationType === "NOT_APPLICABLE_TO") &&
    !reason?.trim()
  ) {
    return "A rejected or negative relation must state why the part does not fit"
  }

  return undefined
}

/**
 * Verdict a relationship can keep with the evidence it has left: accepted and
 * conditional verdicts fall back to unresolved once the proof is gone.
 */
export function downgradeVerdict(
  verdict: ApplicabilityVerdict,
  evidence: EvidenceSummary[]
): ApplicabilityVerdict {
  if (
    VERDICTS_NEEDING_PROOF.includes(verdict) &&
    countIndependentConfirmations(evidence) === 0
  ) {
    return "UNRESOLVED"
  }

  return verdict
}
