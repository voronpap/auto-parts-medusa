import { sdk } from "@lib/config"
import { HttpTypes } from "@medusajs/types"
import { getCacheOptions } from "./cookies"

export type CategoryWithCount = HttpTypes.StoreProductCategory & {
  product_count: number
}

/** How many published products a category holds, without loading them. */
const countProducts = async (categoryId: string): Promise<number> =>
  sdk.client
    .fetch<{ count: number }>("/store/products", {
      query: { category_id: [categoryId], limit: 1, fields: "id" },
      next: { revalidate: 900, tags: ["categories"] },
    })
    .then(({ count }) => count)
    .catch(() => 0)

/**
 * Categories with the number of products in each. The products themselves
 * are never loaded here: a category can hold tens of thousands.
 */
export const listCategories = async (
  query?: Record<string, unknown>
): Promise<CategoryWithCount[]> => {
  const next = {
    ...(await getCacheOptions("categories")),
  }

  const limit = query?.limit || 100
  const categories = await sdk.client
    .fetch<{ product_categories: HttpTypes.StoreProductCategory[] }>(
      "/store/product-categories",
      {
        query: {
          fields:
            "id, name, handle, description, *category_children, *parent_category, *parent_category.parent_category",
          limit,
          ...query,
        },
        next,
        cache: "force-cache",
      }
    )
    .then(({ product_categories }) => product_categories)
  const counts = await Promise.all(
    categories.map((category) => countProducts(category.id))
  )

  return categories
    .map((category, index) => ({ ...category, product_count: counts[index] }))
    .sort((a, b) => b.product_count - a.product_count)
}

export const getCategoryByHandle = async (categoryHandle: string[]) => {
  const handle = `${categoryHandle.join("/")}`

  const next = {
    ...(await getCacheOptions("categories")),
  }

  return sdk.client
    .fetch<HttpTypes.StoreProductCategoryListResponse>(
      `/store/product-categories`,
      {
        query: {
          fields: "id, name, handle, description, *category_children",
          handle,
        },
        next,
        cache: "force-cache",
      }
    )
    .then(({ product_categories }) => product_categories[0])
}
