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
