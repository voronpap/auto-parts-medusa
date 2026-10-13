export type MarkupRule = {
  normalized_brand: string | null
  price_from_minor: number | null
  price_to_minor: number | null
  markup_bp: number
}

const inRange = (rule: MarkupRule, price: number) =>
  (rule.price_from_minor == null || price >= rule.price_from_minor) &&
  (rule.price_to_minor == null || price < rule.price_to_minor)

/**
 * Markup for a purchase price of a brand. A rule for the brand and a price
 * range beats a rule for the brand, which beats a rule for a price range,
 * which beats the default. Returns null when nothing applies.
 */
export function markupFor(
  rules: MarkupRule[],
  defaultMarkupBp: number | null,
  normalizedBrand: string,
  priceMinor: number
): number | null {
  let best: { score: number; markup_bp: number } | null = null

  for (const rule of rules) {
    if (rule.normalized_brand && rule.normalized_brand !== normalizedBrand) {
      continue
    }

    if (!inRange(rule, priceMinor)) {
      continue
    }

    const ranged = rule.price_from_minor != null || rule.price_to_minor != null
    const score = (rule.normalized_brand ? 2 : 0) + (ranged ? 1 : 0)

    if (!best || score > best.score) {
      best = { score, markup_bp: rule.markup_bp }
    }
  }

  return best ? best.markup_bp : defaultMarkupBp
}

/** Shop price in minor units: purchase price plus markup, rounded up to a step. */
export function shopPriceMinor(
  purchaseMinor: number,
  markupBp: number,
  roundingMinor: number
): number {
  const raw = (purchaseMinor * (10_000 + markupBp)) / 10_000
  const step = Math.max(1, roundingMinor)

  // A sum that is whole in minor units must not be pushed up by float noise.
  return Math.ceil(Math.round(raw * 1000) / 1000 / step) * step
}
