import { Metadata } from "next"
import { notFound } from "next/navigation"

import { isSignedIn, listGarage } from "@lib/data/garage"
import { listVehicleMakes, retrieveVehicleMake } from "@lib/data/parts-catalog"
import { SaveCarButton } from "@modules/garage/save-car"
import VehiclePicker from "@modules/garage/vehicle-picker"
import PartsRequestForm from "@modules/parts-request/request-form"
import PickFilter from "@modules/cars/pick-filter"
import { listProducts } from "@lib/data/products"
import { popularOf } from "@lib/util/popular-makes"
import { getRegion } from "@lib/data/regions"
import ProductTable from "@modules/catalog/components/product-table"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

const DESCRIPTION =
  "Оберіть марку, модель і рік автомобіля, щоб побачити запчастини, які до нього підходять."

// A make or a model is its own page in the sitemap, so it is its own canonical.
export async function generateMetadata(props: {
  searchParams: Promise<{ make?: string; model?: string }>
}): Promise<Metadata> {
  const { make, model } = await props.searchParams
  const data = make ? await retrieveVehicleMake(make, model) : null

  if (!make || !data) {
    return {
      title: "Підбір запчастин за автомобілем",
      alternates: { canonical: "/ua/cars" },
      description: DESCRIPTION,
    }
  }

  const name = [data.make.name, data.family?.label].filter(Boolean).join(" ")
  const query = `make=${encodeURIComponent(make)}${
    data.family ? `&model=${encodeURIComponent(data.family.key)}` : ""
  }`

  return {
    title: `Запчастини для ${name}`,
    alternates: { canonical: `/ua/cars?${query}` },
    description: `Запчастини, що підходять до ${name}: пошук за моделлю і роком.`,
  }
}

const years = (from: number | null, to: number | null) => {
  if (from && to) return from === to ? `${from}` : `${from}–${to}`
  if (from) return `з ${from}`
  if (to) return `до ${to}`

  return ""
}

export default async function CarsPage(props: {
  params: Promise<{ countryCode: string }>
  searchParams: Promise<{
    make?: string
    model?: string
    year?: string
    vin?: string
    vin_error?: string
  }>
}) {
  const { countryCode } = await props.params
  const {
    make: makeId,
    model,
    year: typedYear,
    vin: typedVin,
    vin_error: vinError,
  } = await props.searchParams
  // The car came from a VIN (see /vin): it is named on the page and kept with the car.
  const vin = typedVin
    ?.replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, 17)
  const region = await getRegion(countryCode)

  if (!region) {
    notFound()
  }

  const year =
    typedYear && /^\d{4}$/.test(typedYear) ? Number(typedYear) : undefined
  const data = makeId ? await retrieveVehicleMake(makeId, model, year) : null
  const [{ active: garage, cars }, signedIn] = await Promise.all([
    listGarage(),
    isSignedIn(),
  ])

  if (makeId && !data) {
    notFound()
  }

  // Sources write some makes in capitals: "ALSTHOM" goes after "Alfa Romeo".
  const makes = makeId
    ? []
    : (await listVehicleMakes()).sort((a, b) =>
        a.name.localeCompare(b.name, "uk", { sensitivity: "base" })
      )
  const popular = popularOf(makes)
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
    ? Math.min(
        family.year_to ?? new Date().getFullYear(),
        new Date().getFullYear()
      )
    : 0
  const yearList =
    family?.year_from && lastYear >= family.year_from
      ? Array.from(
          { length: lastYear - family.year_from + 1 },
          (_, index) => lastYear - index
        ).slice(0, 40)
      : []
  // A VIN and the year it names stay with the car while the shopper picks
  // the model; picking a year replaces the one from the VIN.
  const vinParam = vin ? `&vin=${vin}` : ""
  const base = `/cars?make=${makeId}${vinParam}`
  const vinNote = vinError
    ? vinError === "format"
      ? "Це не схоже на VIN: у коді має бути рівно 17 латинських літер і цифр, літер I, O та Q у VIN не буває."
      : vinError === "lookup"
      ? "Не вдалося перевірити VIN. Спробуйте ще раз за хвилину."
      : "За цим VIN марку визначити не вдалося. Оберіть авто вручну або залиште запит нижче — менеджер підбере деталь."
    : vin && data
    ? `За VIN ${vin}: ${data.make.name}${family ? ` ${family.label}` : ""}${
        year ? `, ${year} р.` : ""
      }${
        family ? "" : " — модель за VIN не визначено, оберіть її"
      }. Двигун і комплектацію VIN не уточнює — звірте номер деталі перед замовленням.`
    : null

  return (
    <div className="ap-scope ap-page">
      <div className="ap-shell">
        <nav className="ap-crumbs" aria-label="Навігація">
          <LocalizedClientLink href="/">Головна</LocalizedClientLink>
          <span>/</span>
          {data ? (
            <LocalizedClientLink href="/cars">
              Підбір за авто
            </LocalizedClientLink>
          ) : (
            <b>Підбір за авто</b>
          )}
          {data && (
            <>
              <span>/</span>
              {family ? (
                <LocalizedClientLink href={base}>
                  {data.make.name}
                </LocalizedClientLink>
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

        {vinNote && (
          <div
            className={`ap-vin-note ap-card${vinError ? " ap-vin-bad" : ""}`}
          >
            {vinNote}
          </div>
        )}

        {!data && (
          <VehiclePicker
            makes={makes}
            popular={popular}
            current={
              garage
                ? [garage.make, garage.model, garage.year]
                    .filter(Boolean)
                    .join(" ")
                : null
            }
            cars={cars}
            signedIn={signedIn}
          />
        )}

        {data && !family && (
          <section className="ap-section ap-card">
            <div className="ap-section-head">
              <h1 className="ap-pdp-title">{data.make.name}</h1>
              <p>Оберіть модель. У дужках — роки, для яких є деталі.</p>
            </div>
            {data.families.length > 12 && (
              <PickFilter target="all-models" placeholder="Знайти модель" />
            )}
            {data.families.length ? (
              <div className="ap-pick" id="all-models">
                {data.families.map((item) => (
                  <LocalizedClientLink
                    key={item.key}
                    href={`${base}&model=${encodeURIComponent(item.key)}${
                      year ? `&year=${year}` : ""
                    }`}
                  >
                    <strong>{item.label}</strong>
                    <small>{years(item.year_from, item.year_to)}</small>
                  </LocalizedClientLink>
                ))}
              </div>
            ) : (
              <div className="ap-empty">
                Для цієї марки моделей у каталозі немає.
              </div>
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
                    ? `Роки в каталозі: ${years(
                        family.year_from,
                        family.year_to
                      )}. `
                    : ""}
                  Оберіть рік, щоб звузити перелік.
                </p>
                <SaveCarButton
                  signedIn={signedIn}
                  saved={
                    garage?.make_id === data.make.id &&
                    garage?.model_key === family.key &&
                    (garage?.year ?? null) === (year ?? null)
                  }
                  car={{
                    make_id: data.make.id,
                    make: data.make.name,
                    model_key: family.key,
                    model: family.label,
                    names: family.names,
                    year: year ?? null,
                    vin: vin ?? null,
                  }}
                />
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
                      href={`${base}&model=${encodeURIComponent(
                        family.key
                      )}&year=${item}`}
                    >
                      {item}
                    </LocalizedClientLink>
                  ))}
                </div>
              )}
              {family.names.length > 1 && (
                <p className="ap-vin-models">
                  Об&apos;єднано варіанти з каталогів:{" "}
                  {family.names.join(" · ")}
                </p>
              )}
            </section>

            <section className="ap-catalog ap-card">
              <div className="ap-catalog-head">
                <div>
                  <h2>Підходить до авто</h2>
                  <p>
                    {products.length
                      ? `Знайдено товарів: ${products.length}${
                          year ? ` для ${year} року` : ""
                        }`
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

        <section className="ap-section ap-card" id="request">
          <div className="ap-section-head">
            <h2 className="ap-pdp-title">Не знайшли? Підберемо за VIN</h2>
            <p>
              Залиште телефон і що потрібно — менеджер підбере деталь і
              передзвонить.
            </p>
          </div>
          <PartsRequestForm vin={vin} />
        </section>
      </div>
    </div>
  )
}
