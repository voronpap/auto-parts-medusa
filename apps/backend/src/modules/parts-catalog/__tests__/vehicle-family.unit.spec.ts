import {
  familyKey,
  familyLabel,
  inFamily,
  familyOf,
} from "../utils/vehicle-family"

describe("vehicle model families", () => {
  it("takes name and generation, leaving body and type codes out", () => {
    expect(familyKey("OCTAVIA II Combi (1Z5)")).toBe("octavia ii")
    expect(familyKey("Octavia II")).toBe("octavia ii")
    expect(familyKey("TIGGO 7 PRO")).toBe("tiggo 7")
    expect(familyKey("X-TRAIL JPNMAKE T31")).toBe("x-trail")
  })

  it("keeps a bare name apart from its numbered generations", () => {
    expect(inFamily("Golf V", familyOf("Golf"))).toBe(false)
    expect(inFamily("GOLF PLUS", familyOf("Golf"))).toBe(true)
    expect(inFamily("Golf VI", familyOf("GOLF V (1K1)"))).toBe(false)
  })

  it("writes a family the way a shopper reads it", () => {
    expect(familyLabel("octavia ii")).toBe("Octavia II")
    expect(familyLabel("x-trail")).toBe("X-Trail")
    expect(familyLabel("cr-v")).toBe("CR-V")
    expect(familyLabel("tiggo 7")).toBe("Tiggo 7")
  })
})
