/**
 * Reads a price as price lists write it — "1 234,50", "1,234.50", "1234.5",
 * "1 234 грн" — into minor units. Returns null when it is not a positive
 * amount, so a broken row is skipped instead of being priced at zero.
 */
export function parsePriceToMinor(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : null
  }

  if (typeof value !== "string") {
    return null
  }

  let text = value.replace(/[^0-9.,-]/g, "")

  if (!text || text.startsWith("-")) {
    return null
  }

  const lastComma = text.lastIndexOf(",")
  const lastDot = text.lastIndexOf(".")
  const decimalAt = Math.max(lastComma, lastDot)

  if (decimalAt >= 0 && text.length - decimalAt - 1 <= 2) {
    // The last separator is the decimal one; the others group thousands.
    text = `${text.slice(0, decimalAt).replace(/[.,]/g, "")}.${text.slice(decimalAt + 1)}`
  } else {
    text = text.replace(/[.,]/g, "")
  }

  const amount = Number.parseFloat(text)

  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : null
}

/**
 * Stock as price lists write it: a number, ">10", "10+", or words. Returns
 * the quantity when one is stated and the original text otherwise.
 */
export function parseStock(value: unknown): { quantity: number | null; text: string | null } {
  if (value == null || value === "") {
    return { quantity: null, text: null }
  }

  if (typeof value === "number") {
    return { quantity: Number.isFinite(value) ? Math.max(0, Math.floor(value)) : null, text: null }
  }

  const text = String(value).trim()
  const exact = text.match(/^\d+$/)

  if (exact) {
    return { quantity: Number.parseInt(text, 10), text: null }
  }

  const atLeast = text.match(/^(?:>|>=|більше\s*)?\s*(\d+)\s*\+?$/i)

  // "more than ten" is at least ten; the wording is kept beside it.
  return { quantity: atLeast ? Number.parseInt(atLeast[1], 10) : null, text: text.slice(0, 100) }
}
