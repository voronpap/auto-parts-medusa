import { sdk } from "@lib/config"

/**
 * The parsers' catalogue (makers' catalogues and TecDoc, read by our parsers)
 * as the backend serves it under /store/catalog. Every call degrades to an
 * empty answer, so a page still renders when that database is unreachable.
 */

type ShopLink = { handle: string; title: string } | null

export type CatalogRelation = "number" | "analog" | "oe" | "newer" | "older"

export type CatalogSearchPart = {
  brand: string
  number: string
  number_norm: string
  title: string | null
  /** The kind of part in Ukrainian, from TecDoc ("Гальмівний диск"). */
  type: string | null
  category: string | null
  discontinued: boolean
  image: string | null
  relation: CatalogRelation
  sources: string[]
  product: ShopLink
}

export type CatalogCross = {
  brand: string
  number: string
  number_norm: string
  title: string | null
  product: ShopLink
}

export type CatalogPart = {
  brand: string
  number: string
  number_norm: string
  title: string | null
  type: string | null
  description: string | null
  category: string | null
  discontinued: boolean
  sources: { source: string; url: string | null; status: string; fetched_at: string }[]
  images: string[]
  /** Frames of a 360° turn, in order. */
  spin: string[]
  /** Makers' own 3D viewers. */
  viewers: string[]
  videos: { title: string; youtube_id: string }[]
  characteristics: { name: string; value: string }[]
  documents: { name: string; url: string }[]
  oe: CatalogCross[]
  analogs: CatalogCross[]
  newer: CatalogCross[]
  older: CatalogCross[]
  fitment: {
    make: string
    models: {
      model: string
      year_from: number | null
      year_to: number | null
      engines: string[]
      more_engines: number
    }[]
  }[]
  fitment_truncated: boolean
  product: ShopLink
}

export type TecdocMake = { id: number; name: string }
export type TecdocModel = {
  id: number
  name: string
  year_from: number | null
  month_from: number | null
  year_to: number | null
  month_to: number | null
}
export type TecdocVehicle = {
  id: number
  make_id?: number
  model_id?: number
  make?: string
  model?: string
  description: string
  year_from: number | null
  month_from: number | null
  year_to: number | null
  month_to: number | null
  kw_from: string | null
  hp_from: string | null
  capacity_ccm: number | null
  fuel: string | null
  body: string | null
  drive: string | null
  engine_codes: string | null
}
export type VehiclePart = {
  brand: string
  number: string
  number_norm: string
  title: string | null
  type: string | null
  conditions: string | null
  product: ShopLink
}

// The catalogue grows while parsers run; an hour-old answer is fine.
const CACHE = { revalidate: 3600, tags: ["catalog"] }

/** Address of a part card on the storefront (without the country prefix). */
export const catalogPartHref = (brand: string, numberNorm: string) =>
  `/part/${encodeURIComponent(brand)}/${encodeURIComponent(numberNorm)}`

export const searchCatalog = async (q: string): Promise<CatalogSearchPart[]> =>
  sdk.client
    .fetch<{ parts: CatalogSearchPart[] }>("/store/catalog/search", {
      method: "GET",
      query: { q },
      next: CACHE,
    })
    .then((answer) => answer.parts)
    .catch(() => [])

export const retrieveCatalogPart = async (
  brand: string,
  number: string
): Promise<CatalogPart | null> =>
  sdk.client
    .fetch<{ part: CatalogPart }>(
      `/store/catalog/parts/${encodeURIComponent(brand)}/${encodeURIComponent(number)}`,
      { method: "GET", next: CACHE }
    )
    .then((answer) => answer.part)
    .catch(() => null)

export const listTecdocMakes = async (): Promise<TecdocMake[]> =>
  sdk.client
    .fetch<{ makes: TecdocMake[] }>("/store/catalog/makes", {
      method: "GET",
      next: CACHE,
    })
    .then((answer) => answer.makes)
    .catch(() => [])

export const retrieveTecdocMake = async (
  id: number
): Promise<{ make: TecdocMake; models: TecdocModel[] } | null> =>
  sdk.client
    .fetch<{ make: TecdocMake; models: TecdocModel[] }>(`/store/catalog/makes/${id}`, {
      method: "GET",
      next: CACHE,
    })
    .catch(() => null)

export const retrieveTecdocModel = async (
  id: number
): Promise<{
  model: { id: number; name: string; make_id: number; make: string }
  vehicles: TecdocVehicle[]
} | null> =>
  sdk.client
    .fetch<{
      model: { id: number; name: string; make_id: number; make: string }
      vehicles: TecdocVehicle[]
    }>(`/store/catalog/models/${id}`, { method: "GET", next: CACHE })
    .catch(() => null)

export type VehicleSection = {
  id: number
  name: string
  parts: number
  groups: { id: number; name: string; parts: number }[]
}

export type VehicleGroups = {
  vehicle: TecdocVehicle
  total: number
  sections: VehicleSection[]
  other: number
}

export const retrieveTecdocVehicleGroups = async (
  ktype: number
): Promise<VehicleGroups | null> =>
  sdk.client
    .fetch<VehicleGroups>(`/store/catalog/vehicle/${ktype}`, {
      method: "GET",
      next: CACHE,
    })
    .catch(() => null)

export type VehicleGroupParts = {
  vehicle: TecdocVehicle
  group: number
  label: string
  section: { id: number; name: string } | null
  parts: VehiclePart[]
  more: boolean
}

/** Parts of one TecDoc group or section for a vehicle; group 0 is "other". */
export const listTecdocVehicleParts = async (
  ktype: number,
  group: number,
  offset: number
): Promise<VehicleGroupParts | null> =>
  sdk.client
    .fetch<VehicleGroupParts>(`/store/catalog/vehicle/${ktype}`, {
      method: "GET",
      query: { group, offset },
      next: CACHE,
    })
    .catch(() => null)
