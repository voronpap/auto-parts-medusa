import { SourceKind } from "../constants"

// Photos are taken only from the maker's own catalogue or a licensed parts
// database, never from shops or price lists.
export const IMAGE_SOURCE_KINDS: readonly SourceKind[] = [
  "oem_catalog",
  "manufacturer_catalog",
  "licensed_database",
]

export const MAX_IMAGES_PER_NUMBER = 6

/** An absolute http(s) address, or null; "//host/x.jpg" becomes https. */
export function normalizeImageUrl(value?: string | null): string | null {
  const text = value?.trim()

  if (!text) {
    return null
  }

  try {
    const url = new URL(text.startsWith("//") ? `https:${text}` : text)

    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null
  } catch {
    return null
  }
}
