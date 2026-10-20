import { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

import { listTecdocMakes, retrieveTecdocMake, retrieveTecdocModel } from "@lib/data/catalog"
import { isSignedIn, listGarage } from "@lib/data/garage"
import { retrieveVehicleMake } from "@lib/data/parts-catalog"
import { getRegion } from "@lib/data/regions"
import { tecdocCarPath } from "@lib/data/tecdoc-resolve"
import { popularOf } from "@lib/util/popular-makes"
import TecdocBrowser, { isTecdocSearch, TecdocSearch } from "@modules/cars/tecdoc-browser"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import VehiclePicker from "@modules/garage/vehicle-picker"
import PartsRequestForm from "@modules/parts-request/request-form"

type Search = TecdocSearch & { vin?: string; vin_error?: string }

const DESCRIPTION =
  "Оберіть марку і модель автомобіля (рік і двигун — за бажанням), щоб побачити запчастини, які до нього підходять."

const toId = (value?: string) => {
  const id = Number(value)

  return Number.isInteger(id) && id > 0 ? id : null
}

// A make or a model is its own page in the sitemap, so it is its own canonical.
export async function generateMetadata(props: {
  searchParams: Promise<Search>
}): Promise<Metadata> {
  const search = await props.searchParams
  const makeId = toId(search.make)
  const modelId = toId(search.model)
  const named = modelId
    ? await retrieveTecdocModel(modelId).then((answer) =>
        answer
          ? { name: `${answer.model.make} ${answer.model.name}`, query: `model=${modelId}` }
          : null
      )
    : makeId
      ? await retrieveTecdocMake(makeId).then((answer) =>
          answer ? { name: answer.make.name, query: `make=${makeId}` } : null
        )
      : null

  if (!named) {
    return {
      title: "Підбір запчастин за автомобілем",
      alternates: { canonical: "/ua/cars" },
      description: DESCRIPTION,
    }
  }

  return {
    title: `Запчастини для ${named.name}`,
    alternates: { canonical: `/ua/cars?${named.query}` },
    description: `Запчастини, що підходять до ${named.name}: пошук за роком і двигуном.`,
  }
}

const vinErrors: Record<string, string> = {
  format:
    "Це не схоже на VIN: у коді має бути рівно 17 латинських літер і цифр, літер I, O та Q у VIN не буває.",
  lookup: "Не вдалося перевірити VIN. Спробуйте ще раз за хвилину.",
  unknown:
    "За цим VIN марку визначити не вдалося. Оберіть авто вручну або залиште запит нижче — менеджер підбере деталь.",
}

/**
 * Підбір за авто over the TecDoc tree: the picker, then a make, a model (all
 * years or one, all engines) or one engine with its parts. Addresses with
 * the shop's own vehicle makes (older links, garage entries) are sent to the
 * same car in the TecDoc tree.
 */
export default async function CarsPage(props: {
  params: Promise<{ countryCode: string }>
  searchParams: Promise<Search>
}) {
  const { countryCode } = await props.params
  const search = await props.searchParams
  // The car came from a VIN (see /vin): it is named on the page and kept with the car.
  const vin = search.vin?.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 17)
  const year = toId(search.year)

  if (search.make?.startsWith("vmake_")) {
    const legacy = await retrieveVehicleMake(search.make, search.model)
    const path = legacy
      ? await tecdocCarPath({
          make: legacy.make.name,
          models: legacy.family?.names,
          label: legacy.family?.label,
          year,
          vin,
        })
      : null

    redirect(`/${countryCode}${path ?? "/cars"}`)
  }

  const region = await getRegion(countryCode)

  if (!region) {
    notFound()
  }

  const [{ active: garage, cars }, signedIn] = await Promise.all([listGarage(), isSignedIn()])
  const tecdoc = isTecdocSearch(search)
  // TecDoc writes makes in capitals; sorted the Ukrainian way all the same.
  const makes = tecdoc
    ? []
    : (await listTecdocMakes())
        .map((make) => ({ id: String(make.id), name: make.name }))
        .sort((a, b) => a.name.localeCompare(b.name, "uk", { sensitivity: "base" }))
  const vinError = search.vin_error ? vinErrors[search.vin_error] ?? vinErrors.unknown : null

  return (
    <div className="ap-scope ap-page">
      <div className="ap-shell">
        {!tecdoc && (
          <nav className="ap-crumbs" aria-label="Навігація">
            <LocalizedClientLink href="/">Головна</LocalizedClientLink>
            <span>/</span>
            <b>Підбір за авто</b>
          </nav>
        )}

        {vinError && <div className="ap-vin-note ap-card ap-vin-bad">{vinError}</div>}

        {tecdoc ? (
          <TecdocBrowser search={search} signedIn={signedIn} garage={garage} vin={vin ?? null} />
        ) : (
          <VehiclePicker
            makes={makes}
            popular={popularOf(makes)}
            current={
              garage ? [garage.make, garage.model, garage.year].filter(Boolean).join(" ") : null
            }
            cars={cars}
            signedIn={signedIn}
          />
        )}

        <section className="ap-section ap-card" id="request">
          <div className="ap-section-head">
            <h2 className="ap-pdp-title">Не знайшли? Підберемо за VIN</h2>
            <p>Залиште телефон і що потрібно — менеджер підбере деталь і передзвонить.</p>
          </div>
          <PartsRequestForm vin={vin} />
        </section>
      </div>
    </div>
  )
}
