import { countProducts, PER_FILE, sitemapIndex, xmlResponse } from "@lib/data/sitemap"
import { getBaseURL } from "@lib/util/env"

export const dynamic = "force-dynamic"

/** Sitemap index: pages, cars and one file per 50 000 products. */
export async function GET() {
  const count = await countProducts().catch(() => 0)
  const chunks = Math.max(1, Math.ceil(count / PER_FILE))

  return xmlResponse(
    sitemapIndex(getBaseURL(), [
      "pages.xml",
      "cars.xml",
      ...Array.from({ length: chunks }, (_, index) => `products-${index}.xml`),
    ])
  )
}
