import { parsePriceToMinor, parseStock } from "../utils/price"

describe("price list values", () => {
  it("reads prices however thousands and decimals are written", () => {
    expect(parsePriceToMinor("1 234,50")).toBe(123450)
    expect(parsePriceToMinor("1,234.50")).toBe(123450)
    expect(parsePriceToMinor("1.234,5")).toBe(123450)
    expect(parsePriceToMinor("1234")).toBe(123400)
    expect(parsePriceToMinor("1 234 грн")).toBe(123400)
    expect(parsePriceToMinor("12,345")).toBe(1234500)
    expect(parsePriceToMinor(99.99)).toBe(9999)
  })

  it("refuses what is not a positive amount", () => {
    expect(parsePriceToMinor("")).toBeNull()
    expect(parsePriceToMinor("за запитом")).toBeNull()
    expect(parsePriceToMinor("0")).toBeNull()
    expect(parsePriceToMinor("-5")).toBeNull()
    expect(parsePriceToMinor(null)).toBeNull()
  })

  it("reads stock as a quantity or keeps the wording", () => {
    expect(parseStock("12")).toEqual({ quantity: 12, text: null })
    expect(parseStock(3.9)).toEqual({ quantity: 3, text: null })
    expect(parseStock(">10")).toEqual({ quantity: 10, text: ">10" })
    expect(parseStock("10+")).toEqual({ quantity: 10, text: "10+" })
    expect(parseStock("в наявності")).toEqual({ quantity: null, text: "в наявності" })
    expect(parseStock("")).toEqual({ quantity: null, text: null })
  })
})
