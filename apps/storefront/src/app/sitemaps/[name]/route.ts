import {
  carEntries,
  pageEntries,
  productEntries,
  SitemapEntry,
  urlSet,
  xmlResponse,
} from "@lib/data/sitemap"
import { getBaseURL } from "@lib/util/env"

export const dynamic = "force-dynamic"

export async function GET(
  _request: Request,
  props: { params: Promise<{ name: string }> }
) {
  const { name } = await props.params
  const chunk = name.match(/^products-(\d+)\.xml$/)?.[1]
  let entries: SitemapEntry[] | null = null

  if (name === "pages.xml") {
    entries = await pageEntries()
  } else if (name === "cars.xml") {
    entries = await carEntries()
  } else if (chunk !== undefined) {
    entries = await productEntries(Number(chunk))
  }

  if (!entries || (chunk !== undefined && Number(chunk) > 0 && !entries.length)) {
    return new Response("Not found", { status: 404 })
  }

  return xmlResponse(urlSet(getBaseURL(), entries))
}
