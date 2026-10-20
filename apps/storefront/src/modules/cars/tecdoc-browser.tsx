import type { ReactNode } from "react"

import {
  catalogPartHref,
  listTecdocModelParts,
  listTecdocVehicleParts,
  retrieveTecdocMake,
  retrieveTecdocModel,
  retrieveTecdocModelGroups,
  retrieveTecdocVehicleGroups,
  TecdocVehicle,
  VehicleGroupParts,
  VehicleGroups,
} from "@lib/data/catalog"
import { GarageCar } from "@lib/data/garage"
import { TECDOC_MODEL, TECDOC_PREFIX } from "@lib/util/car-href"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { SaveCarButton } from "@modules/garage/save-car"

export type TecdocSearch = {
  make?: string
  model?: string
  year?: string
  ktype?: string
  group?: string
  offset?: string
  /** Models a VIN or an older link points at, shown first on the make page. */
  pick?: string
  vin?: string
}

const PAGE_SIZE = 60

const toId = (value?: string) => {
  const id = Number(value)

  return Number.isInteger(id) && id > 0 ? id : null
}

/** Whether the cars page is showing the TecDoc tree (and not a legacy make). */
export const isTecdocSearch = (search: TecdocSearch) =>
  Boolean(toId(search.ktype) || toId(search.model) || toId(search.make))

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

const href = (params: TecdocSearch) => {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value) as [string, string][]
  ).toString()

  return query ? `/cars?${query}` : "/cars"
}

const PartsPage = ({
  page,
  scope,
  offset,
}: {
  page: Omit<VehicleGroupParts, "vehicle">
  scope: TecdocSearch
  offset: number
}) => (
  <section className="ap-section ap-card">
    <div className="ap-section-head">
      <h2>
        {page.label}
        {page.section ? ` · ${page.section.name}` : ""}
      </h2>
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
                      <small>{part.type ?? part.title ?? ""}</small>
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
                    <LocalizedClientLink className="ap-btn ap-btn-ghost" href={`${link}#order`}>
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
              ...scope,
              group: String(page.group),
              offset: String(Math.max(0, offset - PAGE_SIZE)),
            })}
          >
            ← Назад
          </LocalizedClientLink>
        )}
        {page.more && (
          <LocalizedClientLink
            href={href({ ...scope, group: String(page.group), offset: String(offset + PAGE_SIZE) })}
          >
            Далі →
          </LocalizedClientLink>
        )}
      </nav>
    )}
  </section>
)

const Sections = ({
  groups,
  scope,
}: {
  groups: Omit<VehicleGroups, "vehicle">
  scope: TecdocSearch
}) => (
  <section className="ap-section ap-card">
    <div className="ap-section-head">
      <h2>Запчастини</h2>
      <p>Деталей у каталогах виробників: {groups.total}.</p>
    </div>
    {groups.total ? (
      <div className="ap-makes">
        {groups.sections.map((section, index) => (
          <details key={section.id} open={index < 3}>
            <summary>
              <strong>{section.name}</strong>
              <span>деталей: {section.parts}</span>
            </summary>
            <div className="ap-tree">
              <LocalizedClientLink href={href({ ...scope, group: String(section.id) })}>
                <strong>Усі деталі розділу</strong>
                <small>деталей: {section.parts}</small>
              </LocalizedClientLink>
              {section.groups.map((group) => (
                <LocalizedClientLink key={group.id} href={href({ ...scope, group: String(group.id) })}>
                  <strong>{group.name}</strong>
                  <small>деталей: {group.parts}</small>
                </LocalizedClientLink>
              ))}
            </div>
          </details>
        ))}
        {groups.other > 0 && (
          <div className="ap-tree">
            <LocalizedClientLink href={href({ ...scope, group: "0" })}>
              <strong>Інше</strong>
              <small>ще без групи: {groups.other}</small>
            </LocalizedClientLink>
          </div>
        )}
      </div>
    ) : (
      <div className="ap-empty">
        Для цього вибору деталей ще не зібрано.{" "}
        <a className="ap-link" href="#request">
          Підберемо за VIN
        </a>
      </div>
    )}
  </section>
)

/**
 * The cars page over the TecDoc tree: a make's models; a model (all years or
 * one, all engines) or a single version with its parts sections; one group's
 * parts page by page. The year and the engine are optional.
 */
export default async function TecdocBrowser({
  search,
  signedIn,
  garage,
  vin,
}: {
  search: TecdocSearch
  signedIn: boolean
  garage: GarageCar | null
  vin: string | null
}) {
  const makeId = toId(search.make)
  const modelId = toId(search.model)
  const ktype = toId(search.ktype)
  const year = toId(search.year)
  const groupId = /^\d+$/.test(search.group ?? "") ? Number(search.group) : null
  const offset = Math.max(0, Number(search.offset) || 0)
  const crumbs: { label: string; href?: string }[] = []
  let body: ReactNode = null
  let vinNote: string | null = null

  if (ktype) {
    const scope = { ktype: String(ktype) }
    const groups = groupId === null ? await retrieveTecdocVehicleGroups(ktype) : null
    const page = groupId === null ? null : await listTecdocVehicleParts(ktype, groupId, offset)
    const vehicle = groups?.vehicle ?? page?.vehicle

    if (!vehicle) {
      return <div className="ap-empty ap-card">Модифікацію не знайдено.</div>
    }

    const car: GarageCar = {
      make_id: `${TECDOC_PREFIX}${vehicle.make_id}`,
      make: vehicle.make ?? "",
      model_key: `${TECDOC_PREFIX}${vehicle.id}`,
      model: `${vehicle.model ?? ""} ${vehicle.description}`.trim(),
      names: [vehicle.model ?? ""].filter(Boolean),
      year: null,
      vin,
    }

    crumbs.push(
      { label: vehicle.make ?? "", href: href({ make: String(vehicle.make_id) }) },
      { label: vehicle.model ?? "", href: href({ model: String(vehicle.model_id) }) },
      { label: vehicle.description, href: groupId === null ? undefined : href(scope) }
    )
    body = (
      <>
        <section className="ap-section ap-card">
          <div className="ap-section-head">
            <h1 className="ap-pdp-title">
              {vehicle.make} {vehicle.model} {vehicle.description}
            </h1>
            <p>
              {period(vehicle.year_from, vehicle.month_from, vehicle.year_to, vehicle.month_to)}
              {" · "}
              {power(vehicle)}
              {vehicle.capacity_ccm ? ` · ${vehicle.capacity_ccm} см³` : ""}
              {vehicle.fuel ? ` · ${vehicle.fuel}` : ""}
              {vehicle.body ? ` · ${vehicle.body}` : ""}
              {vehicle.engine_codes ? ` · двигун ${vehicle.engine_codes}` : ""}
            </p>
            <SaveCarButton
              signedIn={signedIn}
              saved={garage?.model_key === car.model_key}
              car={car}
            />
            <p>
              <LocalizedClientLink className="ap-link" href={href({ model: String(vehicle.model_id) })}>
                ← Усі двигуни {vehicle.model}
              </LocalizedClientLink>
            </p>
          </div>
        </section>
        {groups && <Sections groups={groups} scope={scope} />}
        {page && <PartsPage page={page} scope={scope} offset={offset} />}
      </>
    )
  } else if (modelId) {
    const scope = { model: String(modelId), ...(year ? { year: String(year) } : {}) }
    const [versions, groups, page] = await Promise.all([
      retrieveTecdocModel(modelId),
      groupId === null ? retrieveTecdocModelGroups(modelId, year) : null,
      groupId === null ? null : listTecdocModelParts(modelId, year, groupId, offset),
    ])
    const model = groups?.model ?? page?.model

    if (!model || !versions) {
      return <div className="ap-empty ap-card">Модель не знайдено.</div>
    }

    const now = new Date().getFullYear()
    const lastYear = Math.min(model.year_to ?? now, now)
    const yearList =
      model.year_from && lastYear >= model.year_from
        ? Array.from({ length: lastYear - model.year_from + 1 }, (_, index) => lastYear - index)
        : []
    const builtIn = (vehicle: TecdocVehicle) =>
      !year ||
      ((vehicle.year_from == null || vehicle.year_from <= year) &&
        (vehicle.year_to == null || vehicle.year_to >= year))
    // The year's engines first; the others stay listed, marked, so none
    // looks missing.
    const inYear = versions.vehicles.filter(builtIn)
    const engines = [...inYear, ...versions.vehicles.filter((vehicle) => !builtIn(vehicle))]
    const car: GarageCar = {
      make_id: `${TECDOC_PREFIX}${model.make_id}`,
      make: model.make,
      model_key: `${TECDOC_PREFIX}${TECDOC_MODEL}${model.id}`,
      model: model.name,
      names: [model.name],
      year: year ?? null,
      vin,
    }

    if (vin) {
      vinNote = `За VIN ${vin}: ${model.make} ${model.name}${year ? `, ${year} рік` : ""}. Двигун і комплектацію VIN не уточнює — оберіть двигун або звірте номер деталі перед замовленням.`
    }

    crumbs.push(
      { label: model.make, href: href({ make: String(model.make_id) }) },
      {
        label: `${model.name}${year ? `, ${year}` : ""}`,
        href: groupId === null ? undefined : href(scope),
      }
    )
    body = (
      <>
        <section className="ap-section ap-card">
          <div className="ap-section-head">
            <h1 className="ap-pdp-title">
              {model.make} {model.name}
              {year ? `, ${year} рік` : ""}
            </h1>
            <p>
              Показано деталі для {year ? `усіх двигунів ${year} року` : "усіх років і двигунів"}.
              Оберіть рік і двигун, щоб звузити перелік.
            </p>
            <SaveCarButton
              signedIn={signedIn}
              saved={garage?.model_key === car.model_key && (garage?.year ?? null) === car.year}
              car={car}
            />
          </div>
          {yearList.length > 1 && (
            <div className="ap-years">
              <LocalizedClientLink
                className={year ? undefined : "ap-on"}
                href={href({ model: String(modelId) })}
              >
                Усі роки
              </LocalizedClientLink>
              {yearList.map((item) => (
                <LocalizedClientLink
                  key={item}
                  className={item === year ? "ap-on" : undefined}
                  href={href({ model: String(modelId), year: String(item) })}
                >
                  {item}
                </LocalizedClientLink>
              ))}
            </div>
          )}
          {engines.length > 0 && (
            <details className="ap-engines-pick">
              <summary>
                Двигуни (
                {year && inYear.length < engines.length
                  ? `${inYear.length} для ${year} року, усього ${engines.length}`
                  : engines.length}
                )
              </summary>
              <table className="ap-table ap-fit">
                <thead>
                  <tr>
                    <th>Двигун</th>
                    <th>Роки</th>
                    <th>Потужність</th>
                    <th>Код</th>
                  </tr>
                </thead>
                <tbody>
                  {engines.map((vehicle) => (
                    <tr key={vehicle.id}>
                      <td>
                        <LocalizedClientLink className="ap-link" href={href({ ktype: String(vehicle.id) })}>
                          <strong>{vehicle.description}</strong>
                        </LocalizedClientLink>
                        <small>
                          {[
                            vehicle.body,
                            vehicle.fuel,
                            vehicle.capacity_ccm ? `${vehicle.capacity_ccm} см³` : null,
                            builtIn(vehicle) ? null : "інший рік випуску",
                          ]
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
            </details>
          )}
        </section>
        {groups && <Sections groups={groups} scope={scope} />}
        {page && <PartsPage page={page} scope={scope} offset={offset} />}
      </>
    )
  } else if (makeId) {
    const answer = await retrieveTecdocMake(makeId)

    if (!answer) {
      return <div className="ap-empty ap-card">Марку не знайдено.</div>
    }

    const picked = new Set((search.pick ?? "").split(",").map(Number).filter(Boolean))
    const first = answer.models.filter((model) => picked.has(model.id))
    const rest = answer.models.filter((model) => !picked.has(model.id))
    // A year from a VIN stays with the model the shopper picks.
    const modelHref = (id: number) =>
      href({ model: String(id), year: year ? String(year) : undefined, vin: vin ?? undefined })
    const tiles = (models: typeof answer.models) => (
      <div className="ap-tree">
        {models.map((model) => (
          <LocalizedClientLink key={model.id} href={modelHref(model.id)}>
            <strong>{model.name}</strong>
            <small>{period(model.year_from, model.month_from, model.year_to, model.month_to)}</small>
          </LocalizedClientLink>
        ))}
      </div>
    )

    if (vin) {
      vinNote = `За VIN ${vin}: ${answer.make.name}${year ? `, ${year} рік` : ""}${
        first.length ? "" : " — модель за VIN не визначено, оберіть її"
      }.`
    }

    crumbs.push({ label: answer.make.name })
    body = (
      <section className="ap-section ap-card">
        <div className="ap-section-head">
          <h1 className="ap-pdp-title">{answer.make.name}</h1>
          <p>{first.length ? "Найімовірніші моделі — перші." : "Оберіть модель."}</p>
        </div>
        {first.length > 0 && tiles(first)}
        {first.length > 0 && <div className="ap-result-head">Усі моделі</div>}
        {tiles(first.length ? rest : answer.models)}
      </section>
    )
  }

  return (
    <>
      <nav className="ap-crumbs" aria-label="Навігація">
        <LocalizedClientLink href="/">Головна</LocalizedClientLink>
        <span>/</span>
        <LocalizedClientLink href="/cars">Підбір за авто</LocalizedClientLink>
        {crumbs.map((crumb) => (
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
      {vinNote && <div className="ap-vin-note ap-card">{vinNote}</div>}
      {body}
    </>
  )
}
