import { Metadata } from "next"
import { notFound } from "next/navigation"

import { getRegion } from "@lib/data/regions"
import Catalog from "@modules/catalog/templates/catalog"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"

export const metadata: Metadata = {
  title: "Каталог запчастин — Auto Parts",
  description: "Каталог автозапчастин: пошук за артикулом і назвою.",
}

export default async function StorePage(props: {
  params: Promise<{ countryCode: string }>
  searchParams: Promise<{ q?: string; page?: string; sortBy?: SortOptions }>
}) {
  const { countryCode } = await props.params
  const { q, page, sortBy } = await props.searchParams
  const region = await getRegion(countryCode)

  if (!region) {
    notFound()
  }

  return (
    <Catalog
      countryCode={countryCode}
      title="Каталог"
      basePath="/store"
      page={page ? Math.max(1, parseInt(page) || 1) : 1}
      sortBy={sortBy}
      q={q?.trim() || undefined}
    />
  )
}
