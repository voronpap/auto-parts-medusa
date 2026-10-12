import {
  autoApplicationVerdict,
  autoVerdict,
  countIndependentConfirmations,
  defaultRelationshipState,
  downgradeVerdict,
  EvidenceSummary,
  getVerdictViolation,
  isAutoManagedVerdict,
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

describe("autoVerdict", () => {
  const cross = "AFTERMARKET_CROSS" as const

  it("accepts what a manufacturer catalog states", () => {
    expect(autoVerdict({ relation_type: cross, evidence: [catalog] })).toBe(
      "ACCEPTED"
    )
  })

  it("keeps a single shop's claim as a candidate", () => {
    expect(autoVerdict({ relation_type: cross, evidence: [shopA] })).toBe(
      "CANDIDATE"
    )
  })

  it("does not let two shops on one database confirm each other", () => {
    expect(
      autoVerdict({ relation_type: cross, evidence: [shopA, shopB] })
    ).toBe("CANDIDATE")
  })

  it("accepts when independent lineages agree", () => {
    const other: EvidenceSummary = { ...shopA, lineage: "other-db" }

    expect(autoVerdict({ relation_type: cross, evidence: [shopA, other] })).toBe(
      "ACCEPTED"
    )
  })

  it("is conditional when the source attached conditions", () => {
    expect(
      autoVerdict({
        relation_type: cross,
        evidence: [catalog],
        has_constraints: true,
      })
    ).toBe("CONDITIONAL")
  })

  it("never accepts an ambiguous or inferred relation", () => {
    expect(
      autoVerdict({ relation_type: cross, evidence: [catalog], ambiguous: true })
    ).toBe("CANDIDATE")
    expect(
      autoVerdict({
        relation_type: "SPEC_MATCH_CANDIDATE",
        evidence: [catalog],
      })
    ).toBe("CANDIDATE")
  })

  it("rejects a negative statement", () => {
    expect(
      autoVerdict({ relation_type: "NOT_APPLICABLE_TO", evidence: [shopA] })
    ).toBe("REJECTED")
  })
})

describe("autoApplicationVerdict", () => {
  it("accepts catalog fitment and holds back shop fitment", () => {
    expect(autoApplicationVerdict("oem_catalog", false)).toBe("ACCEPTED")
    expect(autoApplicationVerdict("oem_catalog", true)).toBe("CONDITIONAL")
    expect(autoApplicationVerdict("supplier_price", false)).toBe("CANDIDATE")
  })
})

describe("isAutoManagedVerdict", () => {
  it("leaves decided verdicts alone", () => {
    expect(isAutoManagedVerdict("CANDIDATE")).toBe(true)
    expect(isAutoManagedVerdict("REJECTED")).toBe(false)
    expect(isAutoManagedVerdict("ACCEPTED")).toBe(false)
  })
})
