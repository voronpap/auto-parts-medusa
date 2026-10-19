import { ModulesSdkUtils } from "@medusajs/framework/utils"
import { normalizePartNumber } from "../modules/parts-catalog/utils/normalize"

export type ParsersDb = ReturnType<typeof ModulesSdkUtils.createPgConnection>

let connection: ParsersDb | null = null

/**
 * Read-only pool to the parsers database (C:\Users\vrn\projects\parsers,
 * docs/DATABASE.md): the catalogue our parsers gather, read in place. The
 * role it connects as can only SELECT and stops queries after 15 s.
 * Null when PARSERS_DATABASE_URL is not set, so the shop runs without it.
 */
export function parsersDb(): ParsersDb | null {
  const url = process.env.PARSERS_DATABASE_URL

  if (!url) {
    return null
  }

  connection ??= ModulesSdkUtils.createPgConnection({
    clientUrl: url,
    pool: { min: 0, max: 4 },
  })

  return connection
}

/** The parsers' number_norm: Latin letters and digits only, upper case. */
export function numberNorm(value: string): string {
  return normalizePartNumber(value).replace(/[^A-Z0-9]/g, "")
}

/** Brand compared the same way on both sides of a URL. */
export function brandKey(value: string): string {
  return value
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[^\p{L}\p{N}]/gu, "")
}

/**
 * Cross kinds that mean "fits instead of": OE numbers, analogues, supersession
 * and other spellings of the same part. Kits, accessories and related parts
 * are left out of search.
 */
export const SUBSTITUTE_KINDS = [
  "oe",
  "aftermarket",
  "replaced_by",
  "replaces",
  "own_code",
  "alternative",
  "same_part",
  "trade",
  "exchange",
] as const
