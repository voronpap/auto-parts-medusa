import { markupFor, shopPriceMinor } from "../utils/markup"

const rule = (
  markup_bp: number,
  normalized_brand: string | null = null,
  price_from_minor: number | null = null,
  price_to_minor: number | null = null
) => ({ markup_bp, normalized_brand, price_from_minor, price_to_minor })

describe("markup", () => {
  it("uses the default when no rule applies, and nothing when there is no default", () => {
    expect(markupFor([], 2500, "bosch", 10000)).toBe(2500)
    expect(markupFor([rule(4000, "kyb")], 2500, "bosch", 10000)).toBe(2500)
    expect(markupFor([], null, "bosch", 10000)).toBeNull()
  })

  it("prefers the most specific rule", () => {
    const rules = [
      rule(3000, null, 0, 50000),
      rule(2000, "bosch"),
      rule(1500, "bosch", 100000, null),
    ]

    expect(markupFor(rules, 2500, "kyb", 20000)).toBe(3000)
    expect(markupFor(rules, 2500, "bosch", 20000)).toBe(2000)
    expect(markupFor(rules, 2500, "bosch", 150000)).toBe(1500)
    expect(markupFor(rules, 2500, "kyb", 80000)).toBe(2500)
  })

  it("treats the upper bound of a range as not included", () => {
    const rules = [rule(4000, null, null, 50000), rule(3000, null, 50000, null)]

    expect(markupFor(rules, null, "x", 49999)).toBe(4000)
    expect(markupFor(rules, null, "x", 50000)).toBe(3000)
  })

  it("rounds the shop price up to the step", () => {
    expect(shopPriceMinor(17544, 2500, 100)).toBe(22000)
    expect(shopPriceMinor(17544, 2500, 500)).toBe(22000)
    expect(shopPriceMinor(17544, 2500, 1000)).toBe(22000)
    expect(shopPriceMinor(150742, 3000, 100)).toBe(196000)
    expect(shopPriceMinor(10000, 2500, 100)).toBe(12500)
    expect(shopPriceMinor(10000, 0, 1)).toBe(10000)
  })
})
