import { Metadata } from "next"

import { listCategories } from "@lib/data/categories"
import { listProducts } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import SteelHome from "@modules/home/components/steel-home"

export const metadata: Metadata = {
  title: "Auto Parts — підбір і замовлення автозапчастин",
  description:
    "Auto Parts — автозапчастини для СТО, магазинів та автомобілістів. Пошук за артикулом і назвою.",
}

const HOME_PRODUCTS = 60

export default async function Home(props: {
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await props.params
  const region = await getRegion(countryCode)

  if (!region) {
    return null
  }

  const [{ response }, categories] = await Promise.all([
    listProducts({ countryCode, queryParams: { limit: HOME_PRODUCTS } }),
    listCategories().catch(() => []),
  ])

  return (
    <SteelHome
      countryCode={countryCode}
      products={response.products}
      count={response.count}
      categories={categories}
    />
  )
}
