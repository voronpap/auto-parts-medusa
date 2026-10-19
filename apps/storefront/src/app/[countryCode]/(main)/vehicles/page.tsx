import { Metadata } from "next"
import type { ReactNode } from "react"

import {
  catalogPartHref,
  listTecdocMakes,
  listTecdocVehicleParts,
  retrieveTecdocMake,
  retrieveTecdocModel,
  retrieveTecdocVehicleGroups,
  TecdocVehicle,
} from "@lib/data/catalog"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

export const metadata: Metadata = {
  title: "Підбір запчастин за авто — каталог TecDoc",
  description:
    "Марка, модель, модифікація — і всі запчастини, які виробники вказують для вашого авто.",
  alternates: { canonical: "/ua/vehicles" },
}

type Search = {
  make?: string
  model?: string
  ktype?: string
  category?: string
  offset?: string
}

const toId = (value?: string) => {
  const id = Number(value)

  return Number.isInteger(id) && id > 0 ? id : null
}

const period = (
  from: number | null,
  fromMonth: number | null,
  to: number | null,
  toMonth: number | null
) => {
  const date = (year: number | null, month: number | null) =>
    year ? (month ? `${String(month).padStart(2, "0")}.${year}` : `${year}`) : null
  const start = date(from, fromMonth)
  const end = date(to, toMonth)

  if (start && end) return `${start}–${end}`
  if (start) return `з ${start}`
  if (end) return `до ${end}`

  return "—"
}

const power = (vehicle: TecdocVehicle) =>
  vehicle.kw_from
    ? `${Math.round(Number(vehicle.kw_from))} кВт${
        vehicle.hp_from ? ` / ${Math.round(Number(vehicle.hp_from))} к.с.` : ""
      }`
    : "—"

const href = (params: Search) => {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value) as [string, string][]
  ).toString()

  return query ? `/vehicles?${query}` : "/vehicles"
}

/**
 * Parts by vehicle over the TecDoc tree the parsers collect: make, model,
 * version (KType), then the categories and parts listed for that version.
 * Each step is a plain address, so any of them can be bookmarked.
 */
export default async function VehiclesPage(props: {
  searchParams: Promise<Search>
}) {
  const search = await props.searchParams
  const makeId = toId(search.make)
  const modelId = toId(search.model)
  const ktype = toId(search.ktype)
  const offset = Math.max(0, Number(search.offset) || 0)

  const crumbs: { label: string; href?: string }[] = [
    { label: "Марки", href: "/vehicles" },
  ]
  let body: ReactNode

  if (ktype) {
    const groups = search.category ? null : await retrieveTecdocVehicleGroups(ktype)
    const page = search.category
      ? await listTecdocVehicleParts(ktype, search.category, offset)
      : null
    const vehicle = groups?.vehicle ?? page?.vehicle

    if (!vehicle) {
      body = <div className="ap-empty">Модифікацію не знайдено.</div>
    } else {
      crumbs.push(
        { label: vehicle.make ?? "", href: href({ make: String(vehicle.make_id) }) },
        { label: vehicle.model ?? "", href: href({ model: String(vehicle.model_id) }) },
        {
          label: vehicle.description,
          href: search.category ? href({ ktype: String(ktype) }) : undefined,
        }
      )

      const facts = (
        <p>
          {period(vehicle.year_from, vehicle.month_from, vehicle.year_to, vehicle.month_to)}
          {" · "}
          {power(vehicle)}
          {vehicle.capacity_ccm ? ` · ${vehicle.capacity_ccm} см³` : ""}
          {vehicle.fuel ? ` · ${vehicle.fuel}` : ""}
          {vehicle.body ? ` · ${vehicle.body}` : ""}
          {vehicle.engine_codes ? ` · двигун ${vehicle.engine_codes}` : ""}
        </p>
      )

      if (page && search.category) {
        crumbs.push({ label: search.category })
        body = (
          <>
            <div className="ap-section-head">
              <h1 className="ap-pdp-title">
                {search.category}: {vehicle.make} {vehicle.model} {vehicle.description}
              </h1>
              {facts}
            </div>
            {page.parts.length ? (
              <table className="ap-table ap-products">
                <thead>
                  <tr>
                    <th>Деталь</th>
                    <th>Умови</th>
                    <th>
                      <span className="sr-only">Дія</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {page.parts.map((part) => {
                    const link = part.product
                      ? `/products/${part.product.handle}`
                      : catalogPartHref(part.brand, part.number_norm)

                    return (
                      <tr key={`${part.brand}|${part.number_norm}`}>
                        <td>
                          <LocalizedClientLink className="ap-part" href={link}>
                            <span>
                              <strong>
                                {part.brand} {part.number}
                              </strong>
                              <small>{part.title ?? ""}</small>
                            </span>
                          </LocalizedClientLink>
                        </td>
                        <td className="ap-engines">{part.conditions ?? "—"}</td>
                        <td>
                          {part.product ? (
                            <LocalizedClientLink className="ap-btn" href={link}>
                              У магазині
                            </LocalizedClientLink>
                          ) : (
                            <LocalizedClientLink
                              className="ap-btn ap-btn-ghost"
                              href={`${link}#order`}
                            >
                              Замовити
                            </LocalizedClientLink>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : (
              <div className="ap-empty">У цій групі деталей немає.</div>
            )}
            {(offset > 0 || page.more) && (
              <nav className="ap-pager" aria-label="Сторінки">
                {offset > 0 && (
                  <LocalizedClientLink
                    href={href({
                      ktype: String(ktype),
                      category: search.category,
                      offset: String(Math.max(0, offset - 60)),
                    })}
                  >
                    ← Назад
                  </LocalizedClientLink>
                )}
                {page.more && (
                  <LocalizedClientLink
                    href={href({
                      ktype: String(ktype),
                      category: search.category,
                      offset: String(offset + 60),
                    })}
                  >
                    Далі →
                  </LocalizedClientLink>
                )}
              </nav>
            )}
          </>
        )
      } else {
        const total = groups!.groups.reduce((sum, group) => sum + group.parts, 0)

        body = (
          <>
            <div className="ap-section-head">
              <h1 className="ap-pdp-title">
                {vehicle.make} {vehicle.model} {vehicle.description}
              </h1>
              {facts}
              <p>
                Деталей у каталогах виробників: {total}. Групи названо так, як
                їх називає джерело.
              </p>
            </div>
            {groups!.groups.length ? (
              <div className="ap-tree">
                {groups!.groups.map((group) => (
                  <LocalizedClientLink
                    key={group.category}
                    href={href({ ktype: String(ktype), category: group.category })}
                  >
                    <strong>{group.category}</strong>
                    <small>деталей: {group.parts}</small>
                  </LocalizedClientLink>
                ))}
              </div>
            ) : (
              <div className="ap-empty">
                Для цієї модифікації деталей ще не зібрано.{" "}
                <LocalizedClientLink className="ap-link" href="/cars#request">
                  Підберемо за VIN
                </LocalizedClientLink>
              </div>
            )}
          </>
        )
      }
    }
  } else if (modelId) {
    const answer = await retrieveTecdocModel(modelId)

    if (!answer) {
      body = <div className="ap-empty">Модель не знайдено.</div>
    } else {
      crumbs.push(
        { label: answer.model.make, href: href({ make: String(answer.model.make_id) }) },
        { label: answer.model.name }
      )
      body = (
        <>
          <div className="ap-section-head">
            <h1 className="ap-pdp-title">
              {answer.model.make} {answer.model.name}
            </h1>
            <p>Оберіть модифікацію: двигун, потужність і роки випуску.</p>
          </div>
          <table className="ap-table ap-fit">
            <thead>
              <tr>
                <th>Модифікація</th>
                <th>Роки</th>
                <th>Потужність</th>
                <th>Двигун</th>
              </tr>
            </thead>
            <tbody>
              {answer.vehicles.map((vehicle) => (
                <tr key={vehicle.id}>
                  <td>
                    <LocalizedClientLink
                      className="ap-link"
                      href={href({ ktype: String(vehicle.id) })}
                    >
                      <strong>{vehicle.description}</strong>
                    </LocalizedClientLink>
                    <small>
                      {[vehicle.body, vehicle.fuel, vehicle.capacity_ccm ? `${vehicle.capacity_ccm} см³` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  </td>
                  <td className="ap-nowrap">
                    {period(vehicle.year_from, vehicle.month_from, vehicle.year_to, vehicle.month_to)}
                  </td>
                  <td className="ap-nowrap">{power(vehicle)}</td>
                  <td>{vehicle.engine_codes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )
    }
  } else if (makeId) {
    const answer = await retrieveTecdocMake(makeId)

    if (!answer) {
      body = <div className="ap-empty">Марку не знайдено.</div>
    } else {
      crumbs.push({ label: answer.make.name })
      body = (
        <>
          <div className="ap-section-head">
            <h1 className="ap-pdp-title">{answer.make.name}</h1>
            <p>Оберіть модель.</p>
          </div>
          <div className="ap-tree">
            {answer.models.map((model) => (
              <LocalizedClientLink key={model.id} href={href({ model: String(model.id) })}>
                <strong>{model.name}</strong>
                <small>
                  {period(model.year_from, model.month_from, model.year_to, model.month_to)}
                </small>
              </LocalizedClientLink>
            ))}
          </div>
        </>
      )
    }
  } else {
    const makes = await listTecdocMakes()

    crumbs.length = 0
    body = (
      <>
        <div className="ap-section-head">
          <h1 className="ap-pdp-title">Підбір запчастин за авто</h1>
          <p>
            Каталог TecDoc і каталоги виробників: марка → модель → модифікація →
            група деталей. Перелік марок ще поповнюється.
          </p>
        </div>
        {makes.length ? (
          <div className="ap-tree">
            {makes.map((make) => (
              <LocalizedClientLink key={make.id} href={href({ make: String(make.id) })}>
                <strong>{make.name}</strong>
              </LocalizedClientLink>
            ))}
          </div>
        ) : (
          <div className="ap-empty">Каталог авто тимчасово недоступний.</div>
        )}
      </>
    )
  }

  return (
    <div className="ap-scope ap-page" data-testid="vehicles-container">
      <div className="ap-shell">
        <nav className="ap-crumbs" aria-label="Навігація">
          <LocalizedClientLink href="/">Головна</LocalizedClientLink>
          <span>/</span>
          <LocalizedClientLink href="/vehicles">Підбір за авто</LocalizedClientLink>
          {crumbs.slice(1).map((crumb) => (
            <span key={crumb.label + (crumb.href ?? "")} className="ap-crumb">
              <span>/</span>{" "}
              {crumb.href ? (
                <LocalizedClientLink href={crumb.href}>{crumb.label}</LocalizedClientLink>
              ) : (
                <b>{crumb.label}</b>
              )}
            </span>
          ))}
        </nav>
        <section className="ap-section ap-card">{body}</section>
      </div>
    </div>
  )
}
