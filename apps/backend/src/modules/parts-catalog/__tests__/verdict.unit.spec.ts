import {
  countIndependentConfirmations,
  defaultRelationshipState,
  downgradeVerdict,
  EvidenceSummary,
  getVerdictViolation,
} from "../utils/verdict"

const catalog: EvidenceSummary = {
  source_kind: "manufacturer_catalog",
  lineage: "bosch",
  status: "active",
}
const shopA: EvidenceSummary = {
  source_kind: "supplier_price",
  lineage: "tecdoc",
  status: "active",
}
const shopB: EvidenceSummary = { ...shopA }
const ai: EvidenceSummary = {
  source_kind: "ai",
  lineage: "ai",
  status: "active",
}

describe("countIndependentConfirmations", () => {
  it("counts sources with a shared lineage once", () => {
    expect(countIndependentConfirmations([shopA, shopB])).toBe(1)
    expect(countIndependentConfirmations([shopA, shopB, catalog])).toBe(2)
  })

  it("ignores AI output and inactive observations", () => {
    expect(countIndependentConfirmations([ai])).toBe(0)
    expect(
      countIndependentConfirmations([{ ...catalog, status: "retracted" }])
    ).toBe(0)
  })
})

describe("getVerdictViolation", () => {
  it("allows an accepted cross backed by an authoritative source", () => {
    expect(
      getVerdictViolation({
        verdict: "ACCEPTED",
        relation_type: "AFTERMARKET_CROSS",
        evidence: [catalog],
      })
    ).toBeUndefined()
  })

  it("refuses to accept a cross on AI output alone", () => {
    expect(
      getVerdictViolation({
        verdict: "ACCEPTED",
        relation_type: "AFTERMARKET_CROSS",
        evidence: [ai],
      })
    ).toBeDefined()
    expect(
      getVerdictViolation({
        verdict: "CONDITIONAL",
        relation_type: "OEM_REFERENCE",
        evidence: [],
      })
    ).toBeDefined()
  })

  it("never accepts an inferred relation, whatever the evidence", () => {
    expect(
      getVerdictViolation({
        verdict: "ACCEPTED",
        relation_type: "SHARED_APPLICATION_CANDIDATE",
        evidence: [catalog],
      })
    ).toBeDefined()
  })

  it("lets AI propose candidates", () => {
    expect(
      getVerdictViolation({
        verdict: "CANDIDATE",
        relation_type: "VISUAL_OR_TEXT_CANDIDATE",
        evidence: [ai],
      })
    ).toBeUndefined()
  })

  it("requires a reason for rejected and negative relations", () => {
    expect(
      getVerdictViolation({
        verdict: "REJECTED",
        relation_type: "AFTERMARKET_CROSS",
        evidence: [catalog],
      })
    ).toBeDefined()
    expect(
      getVerdictViolation({
        verdict: "REJECTED",
        relation_type: "NOT_APPLICABLE_TO",
        evidence: [],
        reason: "Different connector",
      })
    ).toBeUndefined()
  })
})

describe("defaultRelationshipState", () => {
  it("marks inferred relation types as candidates", () => {
    expect(defaultRelationshipState("SPEC_MATCH_CANDIDATE")).toBe(
      "INFERRED_CANDIDATE"
    )
    expect(defaultRelationshipState("SUPERSEDED_BY")).toBe("ASSERTED")
  })
})

describe("downgradeVerdict", () => {
  it("drops an accepted verdict to unresolved when the proof is gone", () => {
    expect(
      downgradeVerdict("ACCEPTED", [{ ...catalog, status: "retracted" }])
    ).toBe("UNRESOLVED")
    expect(downgradeVerdict("ACCEPTED", [catalog])).toBe("ACCEPTED")
    expect(downgradeVerdict("REJECTED", [])).toBe("REJECTED")
  })
})
