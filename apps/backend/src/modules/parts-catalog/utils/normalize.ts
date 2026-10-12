// Cyrillic letters that look like Latin ones. Part numbers are Latin, but they
// are often typed on a Cyrillic layout, so search keys fold them together.
const CYRILLIC_LOOKALIKES: Record<string, string> = {
  А: "A",
  В: "B",
  Е: "E",
  К: "K",
  М: "M",
  Н: "H",
  О: "O",
  Р: "P",
  С: "C",
  Т: "T",
  У: "Y",
  Х: "X",
  І: "I",
}

// Whitespace, hyphens and dashes, dots, slashes and backslashes.
const SEPARATORS = /[\s\-‐-―.\/\\]+/g

/**
 * Key used to find a part number regardless of how it was typed. Separators
 * are dropped and case is folded; digits, leading zeros, prefixes and suffixes
 * are kept, because they distinguish different parts.
 */
export function normalizePartNumber(value: string): string {
  const upper = value.normalize("NFKC").toUpperCase().replace(SEPARATORS, "")

  return Array.from(upper, (char) => CYRILLIC_LOOKALIKES[char] ?? char).join("")
}

/**
 * Number as shown to people: the source spelling with surrounding whitespace
 * removed and inner runs of whitespace collapsed. Nothing else is changed.
 */
export function formatDisplayNumber(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ")
}

/**
 * Key used to match a brand by its name or any alias: "VW", "vw" and "V.W."
 * are the same, as are "Mercedes-Benz" and "MERCEDES BENZ".
 */
export function normalizeBrandName(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
}
