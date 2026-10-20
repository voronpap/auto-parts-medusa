import { sdk } from "@lib/config"
import { listTecdocMakes, retrieveTecdocMake } from "@lib/data/catalog"
import { INFO_PAGES } from "@modules/info/pages"

export const COUNTRY = process.env.NEXT_PUBLIC_DEFAULT_REGION || "ua"

/** The protocol allows 50 000 URLs per file. */
export const PER_FILE = 50000
const PAGE = 1000
const REVALIDATE = 3600

export type SitemapEntry = { path: string; lastmod?: string | null }

export const countProducts = async (): Promise<number> =>
  sdk.client
    .fetch<{ count: number }>("/store/products", {
      query: { limit: 1, fields: "id" },
      next: { revalidate: REVALIDATE, tags: ["sitemap"] },
    })
    .then(({ count }) => count)

/** One sitemap file of products: chunk 0 holds the first 50 000, and so on. */
export const productEntries = async (
  chunk: number
): Promise<SitemapEntry[]> => {
  const entries: SitemapEntry[] = []

  for (let offset = chunk * PER_FILE; offset < (chunk + 1) * PER_FILE; ) {
    const { products } = await sdk.client.fetch<{
      products: { handle: string; updated_at: string | null }[]
    }>("/store/products", {
      query: {
        limit: PAGE,
        offset,
        fields: "handle,updated_at",
        order: "created_at",
      },
      next: { revalidate: REVALIDATE, tags: ["sitemap"] },
    })

    for (const product of products) {
      entries.push({
        path: `/${COUNTRY}/products/${product.handle}`,
        lastmod: product.updated_at,
      })
    }

    if (products.length < PAGE) {
      break
    }

    offset += PAGE
  }

  return entries
}

/** Home, catalog, car picker, info pages and categories. */
export const pageEntries = async (): Promise<SitemapEntry[]> => {
  const { product_categories } = await sdk.client.fetch<{
    product_categories: { handle: string; updated_at: string | null }[]
  }>("/store/product-categories", {
    query: { limit: PAGE, fields: "handle,updated_at" },
    next: { revalidate: REVALIDATE, tags: ["sitemap"] },
  })

  return [
    { path: `/${COUNTRY}` },
    { path: `/${COUNTRY}/store` },
    { path: `/${COUNTRY}/cars` },
    ...Object.keys(INFO_PAGES).map((slug) => ({
      path: `/${COUNTRY}/info/${slug}`,
    })),
    ...product_categories.map((category) => ({
      path: `/${COUNTRY}/categories/${category.handle}`,
      lastmod: category.updated_at,
    })),
  ]
}

/** Makes and their models from the car picker (the TecDoc tree, cars only). */
export const carEntries = async (): Promise<SitemapEntry[]> => {
  const makes = await listTecdocMakes()
  const entries: SitemapEntry[] = []

  // A few makes at a time: each one is a request to the backend.
  for (let index = 0; index < makes.length; index += 8) {
    const details = await Promise.all(
      makes.slice(index, index + 8).map((make) => retrieveTecdocMake(make.id))
    )

    details.forEach((detail, offset) => {
      entries.push({ path: `/${COUNTRY}/cars?make=${makes[index + offset].id}` })
      detail?.models.forEach((model) =>
        entries.push({ path: `/${COUNTRY}/cars?model=${model.id}` })
      )
    })
  }

  return entries
}

const escape = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")

const lastmod = (value?: string | null) => {
  const date = value ? new Date(value) : null

  return date && !isNaN(date.getTime())
    ? `<lastmod>${date.toISOString()}</lastmod>`
    : ""
}

export const xmlResponse = (body: string) =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?>\n${body}`, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  })

export const urlSet = (base: string, entries: SitemapEntry[]) =>
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries
    .map(
      (entry) =>
        `<url><loc>${escape(base + entry.path)}</loc>${lastmod(
          entry.lastmod
        )}</url>`
    )
    .join("\n")}\n</urlset>\n`

export const sitemapIndex = (base: string, names: string[]) =>
  `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${names
    .map((name) => `<sitemap><loc>${escape(`${base}/sitemaps/${name}`)}</loc></sitemap>`)
    .join("\n")}\n</sitemapindex>\n`
