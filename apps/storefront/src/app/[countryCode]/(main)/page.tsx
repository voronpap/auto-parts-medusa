import { Metadata } from "next"

import { listCategories } from "@lib/data/categories"
import { listProducts } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import SteelHome from "@modules/home/components/steel-home"

export const metadata: Metadata = {
  title: { absolute: "Auto Parts — підбір і замовлення автозапчастин" },
  alternates: { canonical: "/ua" },
  description:
    "Auto Parts — автозапчастини для СТО, магазинів та автомобілістів. Пошук за артикулом і назвою.",
}

const HOME_PRODUCTS = 8

export default async function Home(props: {
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await props.params
  const region = await getRegion(countryCode)

  if (!region) {
    return null
  }

  const [{ response }, categories] = await Promise.all([
    listProducts({ countryCode, queryParams: { limit: 1 } }),
    listCategories().catch(() => []),
  ])
  // The showcase: one product from each of the largest categories.
  const shelves = await Promise.all(
    categories
      .filter((category) => !category.parent_category && category.product_count > 0)
      .slice(0, HOME_PRODUCTS)
      .map((category) =>
        listProducts({
          countryCode,
          queryParams: { limit: 1, category_id: [category.id] },
        })
          .then(({ response }) => response.products[0])
          .catch(() => undefined)
      )
  )

  return (
    <SteelHome
      countryCode={countryCode}
      products={shelves.filter((product) => product !== undefined)}
      count={response.count}
      categories={categories}
    />
  )
}
