/**
 * What can be read from a VIN without a paid database.
 *
 * A VIN always names the manufacturer (its first three characters). The rest
 * depends on the maker: North American VINs and some European and Asian
 * makers put the model year in the tenth position, and the Volkswagen group
 * puts the model's type code in positions seven and eight. Nothing is guessed
 * beyond that: a field the VIN does not carry is left empty.
 */

export type DecodedVin = {
  vin: string
  wmi: string
  make: string | null
  /** Candidate model years, newest first; empty when the maker does not encode it. */
  years: number[]
  /** Volkswagen group type code (e.g. "1Z" for Octavia II), when present. */
  type_code: string | null
}

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/

// World manufacturer identifiers of the makes seen on Ukrainian roads.
const WMI: Record<string, string> = {
  WVW: "Volkswagen", WV1: "Volkswagen", WV2: "Volkswagen", WVG: "Volkswagen",
  "3VW": "Volkswagen", "1VW": "Volkswagen", XW8: "Volkswagen",
  WAU: "Audi", WA1: "Audi", TRU: "Audi",
  TMB: "Skoda", XWW: "Skoda",
  VSS: "Seat",
  WP0: "Porsche", WP1: "Porsche",
  WBA: "BMW", WBS: "BMW", WBX: "BMW", WBY: "BMW", "5UX": "BMW", "4US": "BMW",
  WMW: "Mini",
  WDB: "Mercedes-Benz", WDC: "Mercedes-Benz", WDD: "Mercedes-Benz",
  WDF: "Mercedes-Benz", W1K: "Mercedes-Benz", W1N: "Mercedes-Benz",
  W1V: "Mercedes-Benz", "4JG": "Mercedes-Benz", "55S": "Mercedes-Benz",
  WME: "Smart",
  W0L: "Opel", W0V: "Opel", VXK: "Opel",
  WF0: "Ford", "1FA": "Ford", "1FM": "Ford", "1FT": "Ford", "3FA": "Ford",
  NM0: "Ford",
  VF1: "Renault", VF2: "Renault", UU1: "Dacia",
  VF3: "Peugeot", VR3: "Peugeot", VF7: "Citroen", VR7: "Citroen", VR1: "DS",
  ZFA: "Fiat", ZAR: "Alfa Romeo", ZLA: "Lancia", ZCF: "Iveco",
  JTH: "Lexus", JTJ: "Lexus", "2T2": "Lexus",
  SB1: "Toyota", VNK: "Toyota", NMT: "Toyota", "2T1": "Toyota", "4T1": "Toyota",
  "5TD": "Toyota",
  JHM: "Honda", SHH: "Honda", SHS: "Honda", "1HG": "Honda", "2HG": "Honda",
  "5J6": "Honda", NLA: "Honda",
  JN1: "Nissan", JN8: "Nissan", SJN: "Nissan", VSK: "Nissan", "1N4": "Nissan",
  "5N1": "Nissan", "3N1": "Nissan", JNK: "Infiniti",
  JMZ: "Mazda", JM1: "Mazda", JM3: "Mazda",
  JMB: "Mitsubishi", JA3: "Mitsubishi", JA4: "Mitsubishi", XMC: "Mitsubishi",
  MMB: "Mitsubishi", MMC: "Mitsubishi",
  JF1: "Subaru", JF2: "Subaru", "4S3": "Subaru", "4S4": "Subaru",
  TSM: "Suzuki",
  KMH: "Hyundai", KM8: "Hyundai", TMA: "Hyundai", NLH: "Hyundai",
  "5NP": "Hyundai", "5NM": "Hyundai", Z94: "Hyundai",
  KNA: "Kia", KND: "Kia", KNE: "Kia", U5Y: "Kia", U6Y: "Kia", XWE: "Kia",
  "5XY": "Kia",
  KL1: "Chevrolet", KLA: "Daewoo", "1G1": "Chevrolet", "2G1": "Chevrolet",
  "3G1": "Chevrolet", "1GC": "Chevrolet", "1GN": "Chevrolet", XUF: "Chevrolet",
  KPT: "SsangYong",
  YV1: "Volvo", YV4: "Volvo", LVY: "Volvo", YS3: "Saab",
  SAL: "Land Rover", SAJ: "Jaguar",
  "1J4": "Jeep", "1J8": "Jeep", "1C4": "Jeep",
  "1B3": "Dodge", "2B3": "Dodge", "1D7": "Dodge", "2D4": "Dodge",
  "1C3": "Chrysler", "2C3": "Chrysler", "2C4": "Chrysler", "3C4": "Chrysler",
  "5YJ": "Tesla", "7SA": "Tesla", LRW: "Tesla", XP7: "Tesla",
  XTA: "Lada", Y6D: "ZAZ", XTT: "UAZ", X96: "GAZ", XTH: "GAZ",
  L6T: "Geely", LB3: "Geely", LVV: "Chery", LVT: "Chery", LGX: "BYD",
  LC0: "BYD", LGW: "Great Wall",
}

// Makers known by a two-character prefix whatever the third character is.
const WMI_PREFIX: Record<string, string> = { JT: "Toyota", JS: "Suzuki" }

const VW_GROUP = new Set(["Volkswagen", "Audi", "Skoda", "Seat"])

// Makers outside North America that put the model year in position ten.
const YEAR_IN_VIN = new Set([
  ...VW_GROUP,
  "Porsche", "Opel", "Hyundai", "Kia", "Honda", "Chevrolet", "Daewoo", "Tesla",
  "Volvo", "Land Rover", "Jaguar", "Lada", "ZAZ",
])

// Type codes the group renamed when it changed the VIN layout: the newer
// code in the VIN -> the code catalogues print for the same model.
const TYPE_CODE_ALIASES: Record<string, string> = {
  NE: "5E", // Skoda Octavia III
}

const YEAR_CODES = "ABCDEFGHJKLMNPRSTVWXY123456789"

export function isVin(value: string): boolean {
  return VIN_RE.test(normalizeVin(value))
}

export function normalizeVin(value: string): string {
  return value.replace(/[\s-]+/g, "").toUpperCase()
}

/** Years a position-ten code can stand for, newest first. */
export function modelYears(code: string, now: Date = new Date()): number[] {
  const index = YEAR_CODES.indexOf(code)

  if (index < 0) {
    return []
  }

  const latest = now.getFullYear() + 1

  return [2010 + index, 1980 + index].filter(
    (year) => year >= 1980 && year <= latest
  )
}

export function decodeVin(value: string, now: Date = new Date()): DecodedVin | null {
  const vin = normalizeVin(value)

  if (!VIN_RE.test(vin)) {
    return null
  }

  const wmi = vin.slice(0, 3)
  const make = WMI[wmi] ?? WMI_PREFIX[wmi.slice(0, 2)] ?? null
  const northAmerican = /^[1-5]/.test(vin)
  const encodesYear = northAmerican || (make !== null && YEAR_IN_VIN.has(make))
  // VW-group VINs built outside North America carry the type code in
  // positions seven and eight, whether positions 4-6 are "ZZZ" or coded;
  // North American ones use these positions differently.
  const typeCode =
    make !== null && VW_GROUP.has(make) && !northAmerican
      ? vin.slice(6, 8)
      : null

  return {
    vin,
    wmi,
    make,
    years: encodesYear ? modelYears(vin[9], now) : [],
    type_code: typeCode,
  }
}

/**
 * Whether a catalog model name such as "OCTAVIA II Combi (1Z5)" or
 * "A1 (8X1, 8XK)" carries the given Volkswagen group type code.
 */
export function modelHasTypeCode(modelName: string, typeCode: string): boolean {
  const codes = Array.from(modelName.matchAll(/\(([^)]*)\)/g)).flatMap((match) =>
    match[1].split(/[,;/]/).map((code) => code.trim().toUpperCase())
  )

  const wanted = typeCode.toUpperCase()
  const alias = TYPE_CODE_ALIASES[wanted]

  return codes.some(
    (code) => code.startsWith(wanted) || (alias ? code.startsWith(alias) : false)
  )
}
