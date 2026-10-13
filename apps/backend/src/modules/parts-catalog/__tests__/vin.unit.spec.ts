import {
  decodeVin,
  isVin,
  modelHasTypeCode,
  modelYears,
  normalizeVin,
} from "../utils/vin"

const NOW = new Date("2026-10-13T00:00:00Z")

describe("VIN decoding", () => {
  it("accepts a VIN however it is spaced or cased", () => {
    expect(normalizeVin("tmb jj7ne8-j0123456")).toBe("TMBJJ7NE8J0123456")
    expect(isVin("tmb jj7ne8-j0123456")).toBe(true)
  })

  it("rejects wrong length and the letters a VIN never uses", () => {
    expect(isVin("TMBJJ7NE8J012345")).toBe(false)
    expect(isVin("TMBJJ7NE8J012345O")).toBe(false)
    expect(decodeVin("W 712/95")).toBeNull()
  })

  it("reads make, year and type code of a European VW group VIN", () => {
    expect(decodeVin("TMBZZZ1Z882123456", NOW)).toEqual({
      vin: "TMBZZZ1Z882123456",
      wmi: "TMB",
      make: "Skoda",
      years: [2008],
      type_code: "1Z",
    })
  })

  it("gives both years a code can stand for when both are possible", () => {
    expect(modelYears("J", NOW)).toEqual([2018, 1988])
    expect(modelYears("Y", NOW)).toEqual([2000])
    expect(modelYears("Z", NOW)).toEqual([])
  })

  it("reads the type code of a newer VIN that has no ZZZ filler", () => {
    expect(decodeVin("TMBJJ7NE8J0123456", NOW)?.type_code).toBe("NE")
  })

  it("does not read a type code from a North American VIN", () => {
    expect(decodeVin("3VWFE21C04M000001", NOW)?.type_code).toBeNull()
  })

  it("leaves the year empty for makers that do not encode it", () => {
    const renault = decodeVin("VF1LM1B0H36666155", NOW)

    expect(renault?.make).toBe("Renault")
    expect(renault?.years).toEqual([])
  })

  it("reads the year of a North American VIN of any maker", () => {
    expect(decodeVin("1HGCM82633A004352", NOW)?.years).toEqual([2003])
  })

  it("knows makers by a two-character prefix", () => {
    expect(decodeVin("JTDKB20U093123456", NOW)?.make).toBe("Toyota")
  })

  it("names no make for an unknown manufacturer code", () => {
    expect(decodeVin("ZZZAAAAAAAA123456", NOW)?.make).toBeNull()
  })

  it("matches a type code against the codes in a model name", () => {
    expect(modelHasTypeCode("OCTAVIA II Combi (1Z5)", "1Z")).toBe(true)
    expect(modelHasTypeCode("A1 (8X1, 8XK)", "8X")).toBe(true)
    expect(modelHasTypeCode("OCTAVIA III (5E3)", "1Z")).toBe(false)
    expect(modelHasTypeCode("Octavia 1Z", "1Z")).toBe(false)
    // The newer VIN layout names Octavia III "NE"; catalogues print "5E".
    expect(modelHasTypeCode("OCTAVIA III (5E3)", "NE")).toBe(true)
  })
})
