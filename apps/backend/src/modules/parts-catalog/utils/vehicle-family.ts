/**
 * Sources name the same model differently: "OCTAVIA II (1Z3)", "Octavia II",
 * "OCTAVIA II Combi (1Z5)". A family is the model's name and generation,
 * which is what a shopper picks; body styles and type codes fall inside it.
 */

const GENERATION_RE = /^(?:[ivx]+|\d{1,2})$/i

export const modelTokens = (name: string): string[] =>
  name
    .replace(/\([^)]*\)/g, " ")
    .toLowerCase()
    .split(/[\s/,]+/)
    .filter(Boolean)

/** Name and generation of a model: "OCTAVIA II Combi (1Z5)" -> octavia, ii. */
export const familyOf = (name: string): string[] => {
  const parts = modelTokens(name)

  return parts.length > 1 && GENERATION_RE.test(parts[1])
    ? parts.slice(0, 2)
    : parts.slice(0, 1)
}

export const inFamily = (name: string, family: string[]): boolean => {
  const parts = modelTokens(name)

  if (!family.length || family.some((part, index) => parts[index] !== part)) {
    return false
  }

  // "Golf" alone must not take in "Golf V".
  return family.length > 1 || !GENERATION_RE.test(parts[1] ?? "")
}

export const familyKey = (name: string): string => familyOf(name).join(" ")

/** "octavia ii" -> "Octavia II", "x-trail" -> "X-Trail", "cr-v" -> "CR-V". */
export const familyLabel = (key: string): string =>
  key
    .split(" ")
    .map((word, index) =>
      index > 0 && GENERATION_RE.test(word)
        ? word.toUpperCase()
        : word
            .split("-")
            .map((part) =>
              // Short pieces and pieces with digits are designations: A1, CR, RAV4.
              part.length <= 2 || /\d/.test(part)
                ? part.toUpperCase()
                : part.charAt(0).toUpperCase() + part.slice(1)
            )
            .join("-")
    )
    .join(" ")
