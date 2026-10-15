import { Metadata } from "next"
import { notFound } from "next/navigation"

import { getCategoryByHandle } from "@lib/data/categories"
import Catalog from "@modules/catalog/templates/catalog"
import { breadcrumbList, JsonLd } from "@modules/seo/json-ld"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"

type Props = {
  params: Promise<{ category: string[]; countryCode: string }>
  searchParams: Promise<{ q?: string; page?: string; sortBy?: SortOptions }>
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params
  const category = await getCategoryByHandle(
    params.category.map(decodeURIComponent)
  ).catch(() => null)

  if (!category) {
    notFound()
  }

  return {
    title: category.name,
    description: category.description || `${category.name}: каталог запчастин.`,
    alternates: {
      canonical: `/${params.countryCode}/categories/${params.category.join("/")}`,
    },
  }
}

export default async function CategoryPage(props: Props) {
  const params = await props.params
  const { q, page, sortBy } = await props.searchParams
  const handle = params.category.map(decodeURIComponent)
  const category = await getCategoryByHandle(handle)

  if (!category) {
    notFound()
  }

  const path = `/${params.countryCode}/categories/${handle.join("/")}`

  return (
    <>
      <JsonLd
        data={breadcrumbList([
          ["Головна", `/${params.countryCode}`],
          ["Каталог", `/${params.countryCode}/store`],
          [category.name, path],
        ])}
      />
      <Catalog
        countryCode={params.countryCode}
        title={category.name}
        description={category.description}
        basePath={`/categories/${handle.join("/")}`}
        categoryId={category.id}
        page={page ? Math.max(1, parseInt(page) || 1) : 1}
        sortBy={sortBy}
        q={q?.trim() || undefined}
      />
    </>
  )
}
