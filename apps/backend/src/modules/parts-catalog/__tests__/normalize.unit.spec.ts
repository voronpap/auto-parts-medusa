import {
  formatDisplayNumber,
  normalizeBrandName,
  normalizePartNumber,
} from "../utils/normalize"

describe("normalizePartNumber", () => {
  it("ignores spaces, hyphens, dots and slashes", () => {
    expect(normalizePartNumber("0 986 478 123")).toBe("0986478123")
    expect(normalizePartNumber("1K0-615-301-AA")).toBe("1K0615301AA")
    expect(normalizePartNumber("A 000.420/12 20")).toBe("A0004201220")
    expect(normalizePartNumber("34\\11–6")).toBe("34116")
  })

  it("keeps leading zeros, prefixes and suffixes", () => {
    expect(normalizePartNumber("0001")).toBe("0001")
    expect(normalizePartNumber("001")).not.toBe(normalizePartNumber("1"))
    expect(normalizePartNumber("GDB1550")).not.toBe(
      normalizePartNumber("GDB1550S")
    )
  })

  it("folds case", () => {
    expect(normalizePartNumber("gdb1550")).toBe("GDB1550")
  })

  it("treats Cyrillic lookalikes as Latin letters", () => {
    expect(normalizePartNumber("1К0615301АА")).toBe("1K0615301AA")
    expect(normalizePartNumber("ОС90")).toBe("OC90")
  })

  it("does not confuse the letter O with zero", () => {
    expect(normalizePartNumber("OC90")).not.toBe(normalizePartNumber("0C90"))
  })
})

describe("formatDisplayNumber", () => {
  it("trims and collapses whitespace without touching the number", () => {
    expect(formatDisplayNumber("  0 986  478 123 ")).toBe("0 986 478 123")
    expect(formatDisplayNumber("1K0-615-301-AA")).toBe("1K0-615-301-AA")
  })
})

describe("normalizeBrandName", () => {
  it("matches spelling variants of the same brand", () => {
    expect(normalizeBrandName("Mercedes-Benz")).toBe(
      normalizeBrandName("MERCEDES BENZ")
    )
    expect(normalizeBrandName("V.W.")).toBe("vw")
  })

  it("keeps Cyrillic names", () => {
    expect(normalizeBrandName("ВАЗ")).toBe("ваз")
  })
})
