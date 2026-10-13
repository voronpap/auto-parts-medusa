import { Metadata } from "next"
import { notFound } from "next/navigation"

import { listVehicleMakes, retrieveVehicleMake } from "@lib/data/parts-catalog"
import { listProducts } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import ProductTable from "@modules/catalog/components/product-table"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

export const metadata: Metadata = {
  title: "Підбір запчастин за автомобілем — Auto Parts",
  description:
    "Оберіть марку, модель і рік автомобіля, щоб побачити запчастини, які до нього підходять.",
}

// Makes shoppers look for first; the rest follow alphabetically.
const POPULAR = [
  "Volkswagen", "Skoda", "Audi", "Renault", "Toyota", "Hyundai", "Kia",
  "Nissan", "Ford", "Opel", "Chery", "Geely", "BYD", "Great Wall",
]

const years = (from: number | null, to: number | null) => {
  if (from && to) return from === to ? `${from}` : `${from}–${to}`
  if (from) return `з ${from}`
  if (to) return `до ${to}`

  return ""
}

export default async function CarsPage(props: {
  params: Promise<{ countryCode: string }>
  searchParams: Promise<{ make?: string; model?: string; year?: string }>
}) {
  const { countryCode } = await props.params
  const { make: makeId, model, year: typedYear } = await props.searchParams
  const region = await getRegion(countryCode)

  if (!region) {
    notFound()
  }

  const year = typedYear && /^\d{4}$/.test(typedYear) ? Number(typedYear) : undefined
  const data = makeId ? await retrieveVehicleMake(makeId, model, year) : null

  if (makeId && !data) {
    notFound()
  }

  const makes = makeId ? [] : await listVehicleMakes()
  const popular = POPULAR.map((name) =>
    makes.find((make) => make.name.toLowerCase() === name.toLowerCase())
  ).filter((make): make is (typeof makes)[number] => Boolean(make))
  const family = data?.family ?? null
  const products = data?.product_ids.length
    ? await listProducts({
        countryCode,
        queryParams: { id: data.product_ids.slice(0, 200), limit: 200 },
      })
        .then(({ response }) => response.products)
        .catch(() => [])
    : []
  const lastYear = family
    ? Math.min(family.year_to ?? new Date().getFullYear(), new Date().getFullYear())
    : 0
  const yearList =
    family?.year_from && lastYear >= family.year_from
      ? Array.from({ length: lastYear - family.year_from + 1 }, (_, index) => lastYear - index).slice(0, 40)
      : []
  const base = `/cars?make=${makeId}`

  return (
    <div className="ap-scope ap-page">
      <div className="ap-shell">
        <nav className="ap-crumbs" aria-label="Навігація">
          <LocalizedClientLink href="/">Головна</LocalizedClientLink>
          <span>/</span>
          {data ? (
            <LocalizedClientLink href="/cars">Підбір за авто</LocalizedClientLink>
          ) : (
            <b>Підбір за авто</b>
          )}
          {data && (
            <>
              <span>/</span>
              {family ? (
                <LocalizedClientLink href={base}>{data.make.name}</LocalizedClientLink>
              ) : (
                <b>{data.make.name}</b>
              )}
            </>
          )}
          {family && (
            <>
              <span>/</span>
              <b>{family.label}</b>
            </>
          )}
        </nav>

        {!data && (
          <section className="ap-section ap-card">
            <div className="ap-section-head">
              <h1 className="ap-pdp-title">Підбір за автомобілем</h1>
              <p>
                Оберіть марку — далі модель і рік. Показуємо марки, для яких у
                каталозі є деталі. Знаєте VIN?{" "}
                <LocalizedClientLink className="ap-link" href="/vin">
                  Підберіть за VIN
                </LocalizedClientLink>
                .
              </p>
            </div>
            {popular.length > 0 && (
              <>
                <div className="ap-side-head">Популярні марки</div>
                <div className="ap-pick ap-pick-big">
                  {popular.map((make) => (
                    <LocalizedClientLink key={make.id} href={`/cars?make=${make.id}`}>
                      <strong>{make.name}</strong>
                      <small>товарів: {make.products}</small>
                    </LocalizedClientLink>
                  ))}
                </div>
              </>
            )}
            <div className="ap-side-head">Усі марки</div>
            {makes.length ? (
              <div className="ap-pick">
                {makes.map((make) => (
                  <LocalizedClientLink key={make.id} href={`/cars?make=${make.id}`}>
                    <strong>{make.name}</strong>
                    <small>{make.products}</small>
                  </LocalizedClientLink>
                ))}
              </div>
            ) : (
              <div className="ap-empty">Застосовність у каталозі ще не заповнена.</div>
            )}
          </section>
        )}

        {data && !family && (
          <section className="ap-section ap-card">
            <div className="ap-section-head">
              <h1 className="ap-pdp-title">{data.make.name}</h1>
              <p>Оберіть модель. У дужках — роки, для яких є деталі.</p>
            </div>
            {data.families.length ? (
              <div className="ap-pick">
                {data.families.map((item) => (
                  <LocalizedClientLink
                    key={item.key}
                    href={`${base}&model=${encodeURIComponent(item.key)}`}
                  >
                    <strong>{item.label}</strong>
                    <small>{years(item.year_from, item.year_to)}</small>
                  </LocalizedClientLink>
                ))}
              </div>
            ) : (
              <div className="ap-empty">Для цієї марки моделей у каталозі немає.</div>
            )}
          </section>
        )}

        {data && family && (
          <>
            <section className="ap-section ap-card">
              <div className="ap-section-head">
                <h1 className="ap-pdp-title">
                  {data.make.name} {family.label}
                </h1>
                <p>
                  {years(family.year_from, family.year_to)
                    ? `Роки в каталозі: ${years(family.year_from, family.year_to)}. `
                    : ""}
                  Оберіть рік, щоб звузити перелік.
                </p>
              </div>
              {yearList.length > 1 && (
                <div className="ap-years">
                  <LocalizedClientLink
                    className={year ? undefined : "ap-on"}
                    href={`${base}&model=${encodeURIComponent(family.key)}`}
                  >
                    Усі роки
                  </LocalizedClientLink>
                  {yearList.map((item) => (
                    <LocalizedClientLink
                      key={item}
                      className={item === year ? "ap-on" : undefined}
                      href={`${base}&model=${encodeURIComponent(family.key)}&year=${item}`}
                    >
                      {item}
                    </LocalizedClientLink>
                  ))}
                </div>
              )}
              {family.names.length > 1 && (
                <p className="ap-vin-models">
                  Об&apos;єднано варіанти з каталогів: {family.names.join(" · ")}
                </p>
              )}
            </section>

            <section className="ap-catalog ap-card">
              <div className="ap-catalog-head">
                <div>
                  <h2>Підходить до авто</h2>
                  <p>
                    {products.length
                      ? `Знайдено товарів: ${products.length}${year ? ` для ${year} року` : ""}`
                      : "Для цього вибору товарів немає"}
                    . Двигун і комплектацію звірте на сторінці товару.
                  </p>
                </div>
                <LocalizedClientLink className="ap-all" href={base}>
                  ← Інша модель
                </LocalizedClientLink>
              </div>
              {products.length > 0 && (
                <ProductTable products={products} countryCode={countryCode} />
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
