import { sdk } from "@lib/config"

export type PartsCatalogInfo = {
  numbers: { brand: string; number: string; number_type: string }[]
  crosses: {
    brand: string
    number: string
    kind: "oem" | "aftermarket" | "replacement" | "replaces"
    conditional: boolean
    product: { handle: string; title: string } | null
  }[]
  fitment: {
    make: string
    models: {
      model: string
      year_from: number | null
      year_to: number | null
      engines: string[]
      more_engines: number
      conditional: boolean
    }[]
  }[]
  attributes: { name: string; value: string; unit: string | null }[]
}

const EMPTY: PartsCatalogInfo = {
  numbers: [],
  crosses: [],
  fitment: [],
  attributes: [],
}

/**
 * Crosses, fitment and characteristics the parts catalog holds for a product.
 * The product page still renders when the catalog cannot be read.
 */
export const retrievePartsCatalog = async (
  productId: string
): Promise<PartsCatalogInfo> =>
  sdk.client
    .fetch<PartsCatalogInfo>(`/store/parts-catalog/products/${productId}`, {
      method: "GET",
      // Catalog data changes when parsers bring new facts, not per request.
      next: { revalidate: 900, tags: ["parts-catalog"] },
    })
    .then((info) => ({
      ...info,
      // A note the parser leaves for the admin, not a property of the part.
      attributes: info.attributes.filter(
        (attribute) => !attribute.name.startsWith("Застосовність у каталозі")
      ),
    }))
    .catch(() => EMPTY)

export type NumberMatch = {
  product_id: string
  handle: string
  via: "number" | "cross"
  matched: { brand: string; number: string }
}

/**
 * Products for a typed part number: the one carrying the number and the ones
 * the catalog lists as its confirmed crosses.
 */
export const searchByPartNumber = async (q: string): Promise<NumberMatch[]> =>
  sdk.client
    .fetch<{ matches: NumberMatch[] }>("/store/parts-catalog/search", {
      method: "GET",
      query: { q },
      next: { revalidate: 300, tags: ["parts-catalog"] },
    })
    .then(({ matches }) => matches)
    .catch(() => [])

export type VinLookup = {
  vehicle: {
    vin: string
    make: string | null
    years: number[]
    type_code: string | null
    model: string | null
    engine: string | null
    models: string[]
  }
  precision: "model" | "make" | "none"
  products: { product_id: string; handle: string }[]
}

/** The vehicle a VIN names and the products the catalog lists for it. */
export const lookupVin = async (vin: string): Promise<VinLookup | null> =>
  sdk.client
    .fetch<VinLookup>(`/store/parts-catalog/vin/${encodeURIComponent(vin)}`, {
      method: "GET",
      next: { revalidate: 900, tags: ["parts-catalog"] },
    })
    .catch(() => null)

export type VehicleMake = { id: string; name: string; products: number }

export type VehicleFamily = {
  key: string
  label: string
  year_from: number | null
  year_to: number | null
}

export type VehicleMakeDetail = {
  make: { id: string; name: string }
  families: VehicleFamily[]
  family: (VehicleFamily & { names: string[] }) | null
  product_ids: string[]
}

/** Makes the store has at least one fitting product for. */
export const listVehicleMakes = async (): Promise<VehicleMake[]> =>
  sdk.client
    .fetch<{ makes: VehicleMake[] }>("/store/parts-catalog/vehicles", {
      method: "GET",
      next: { revalidate: 900, tags: ["parts-catalog"] },
    })
    .then(({ makes }) => makes)
    .catch(() => [])

/** Model families of a make and, for a chosen family, the fitting products. */
export const retrieveVehicleMake = async (
  makeId: string,
  family?: string,
  year?: number
): Promise<VehicleMakeDetail | null> =>
  sdk.client
    .fetch<VehicleMakeDetail>(
      `/store/parts-catalog/vehicles/${encodeURIComponent(makeId)}`,
      {
        method: "GET",
        query: { ...(family ? { family } : {}), ...(year ? { year } : {}) },
        next: { revalidate: 900, tags: ["parts-catalog"] },
      }
    )
    .catch(() => null)

export type PartOffer = {
  offer_id: string
  brand: string
  number: string
  title: string | null
  price: number
  currency_code: string
  in_stock: boolean
  stock_quantity: number | null
  lead_days: number | null
  via: "number" | "cross"
  matched: { brand: string; number: string } | null
  product_handle: string | null
}

/** What can be bought for a typed number: the part itself and its confirmed analogs. */
export const listPartOffers = async (q: string): Promise<PartOffer[]> =>
  sdk.client
    .fetch<{ offers: PartOffer[] }>("/store/parts-catalog/offers", {
      method: "GET",
      query: { q },
      // Prices and stock follow the price list, so they are kept briefly.
      next: { revalidate: 120, tags: ["parts-offers"] },
    })
    .then(({ offers }) => offers)
    .catch(() => [])
