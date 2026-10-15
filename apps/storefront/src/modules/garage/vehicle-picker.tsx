"use client"

import { chooseGarageCar, GarageEntry } from "@lib/data/garage"
import {
  VehicleFamily,
  VehicleMake,
  VehicleMatch,
} from "@lib/data/parts-catalog"
import {
  pickerEngine,
  pickerFamilies,
  pickerSearch,
} from "@lib/data/vehicle-picker"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { useParams, useRouter } from "next/navigation"
import { FormEvent, useEffect, useRef, useState, useTransition } from "react"

type Props = {
  makes: VehicleMake[]
  popular: VehicleMake[]
  /** The chosen car's title, when there is one. */
  current: string | null
  cars: GarageEntry[]
  signedIn: boolean
}

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/

const years = (from: number | null, to: number | null) => {
  if (from && to) return from === to ? `${from}` : `${from}–${to}`
  if (from) return `з ${from}`
  if (to) return `до ${to}`

  return ""
}

const carTitle = (car: Pick<GarageEntry, "make" | "model" | "year">) =>
  [car.make, car.model, car.year].filter(Boolean).join(" ")

/** Results of a typed search that arrive while the shopper keeps typing. */
function useLookup(
  text: string,
  minLength: number,
  find: (text: string) => Promise<VehicleMatch[]>
) {
  const [state, setState] = useState<{ for: string; items: VehicleMatch[] }>({
    for: "",
    items: [],
  })
  const latest = useRef("")

  useEffect(() => {
    const clean = text.trim()

    latest.current = clean

    if (clean.length < minLength) {
      return
    }

    const timer = setTimeout(() => {
      find(clean)
        .then((items) => {
          if (latest.current === clean) {
            setState({ for: clean, items })
          }
        })
        .catch(() => undefined)
    }, 300)

    return () => clearTimeout(timer)
  }, [text, minLength, find])

  const clean = text.trim()

  return {
    items: clean.length >= minLength && state.for === clean ? state.items : [],
    loading: clean.length >= minLength && state.for !== clean,
    asked: clean.length >= minLength,
  }
}

const TYPES = [
  { id: "car", label: "Легкові", active: true },
  { id: "van", label: "Вантажні", active: false },
  { id: "moto", label: "Мотоцикли", active: false },
  { id: "tractor", label: "Сільгосптехніка", active: false },
]

function TypeIcon({ id }: { id: string }) {
  const common = {
    width: 34,
    height: 34,
    viewBox: "0 0 34 34",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  }

  if (id === "van") {
    return (
      <svg {...common}>
        <path d="M3 9h17v14H3zM20 13h6l5 5v5H20z" />
        <circle cx="9" cy="25" r="2.6" />
        <circle cx="25" cy="25" r="2.6" />
      </svg>
    )
  }

  if (id === "moto") {
    return (
      <svg {...common}>
        <circle cx="7" cy="23" r="4.5" />
        <circle cx="27" cy="23" r="4.5" />
        <path d="M7 23l7-8h7l6 8M18 15l-2-5h-4M21 15l2-4h4" />
      </svg>
    )
  }

  if (id === "tractor") {
    return (
      <svg {...common}>
        <circle cx="9" cy="23" r="6" />
        <circle cx="27" cy="25" r="3.5" />
        <path d="M6 17V7h9l3 8h10v6M15 7v8" />
      </svg>
    )
  }

  return (
    <svg {...common}>
      <path d="M4 21v-5l3-6c.4-.8 1.2-1.3 2.1-1.3h15.8c.9 0 1.7.5 2.1 1.3l3 6v5z" />
      <path d="M4 16h26M9 21v3M25 21v3" />
      <circle cx="10" cy="18.5" r="0.6" />
      <circle cx="24" cy="18.5" r="0.6" />
    </svg>
  )
}

/**
 * The cars page before a make is chosen: make, model and year lists, a
 * phrase search, VIN and engine code, popular and all makes. Choosing a car
 * opens its parts; a signed-in shopper's choice also goes into the garage.
 */
export default function VehiclePicker({
  makes,
  popular,
  current,
  cars,
  signedIn,
}: Props) {
  const router = useRouter()
  const { countryCode } = useParams<{ countryCode: string }>()
  const [tab, setTab] = useState<"pick" | "recent">("pick")
  const [phrase, setPhrase] = useState("")
  const [engine, setEngine] = useState("")
  const [vin, setVin] = useState("")
  const [vinError, setVinError] = useState(false)
  const [makeId, setMakeId] = useState("")
  const [families, setFamilies] = useState<VehicleFamily[] | null>(null)
  const [familyKey, setFamilyKey] = useState("")
  const [year, setYear] = useState("")
  const [allFilter, setAllFilter] = useState("")
  const [pending, startTransition] = useTransition()
  const left = useRef<HTMLFormElement>(null)
  const found = useLookup(phrase, 2, pickerSearch)
  const engines = useLookup(engine, 3, pickerEngine)

  const make = makes.find((item) => item.id === makeId) ?? null
  const family = families?.find((item) => item.key === familyKey) ?? null
  const now = new Date().getFullYear()
  const lastYear = family ? Math.min(family.year_to ?? now, now) : 0
  const yearList =
    family?.year_from && lastYear >= family.year_from
      ? Array.from(
          { length: lastYear - family.year_from + 1 },
          (_, index) => lastYear - index
        ).slice(0, 40)
      : []
  const filtered = allFilter.trim()
    ? makes.filter((item) =>
        item.name.toLowerCase().includes(allFilter.trim().toLowerCase())
      )
    : makes

  // A make picked from the brand buttons fills the lists on the left, which
  // on a phone are above: bring them into view.
  const chooseBrand = (id: string) => {
    chooseMake(id)
    left.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const chooseMake = (id: string) => {
    setMakeId(id)
    setFamilies(null)
    setFamilyKey("")
    setYear("")

    if (id) {
      pickerFamilies(id)
        .then(setFamilies)
        .catch(() => setFamilies([]))
    }
  }

  // Opens the parts of a car and, for a signed-in shopper, keeps it in the garage.
  const go = (car: GarageEntry) => {
    startTransition(async () => {
      if (signedIn) {
        await chooseGarageCar(car)
      }

      const query = new URLSearchParams({ make: car.make_id })

      if (car.model_key) query.set("model", car.model_key)
      if (car.year) query.set("year", String(car.year))

      router.push(`/${countryCode}/cars?${query}`)
      router.refresh()
    })
  }

  const goMatch = (match: VehicleMatch) =>
    go({
      make_id: match.make_id,
      make: match.make,
      model_key: match.key,
      model: match.label,
      year: null,
    })

  const submitPick = (event: FormEvent) => {
    event.preventDefault()

    if (make && family) {
      go({
        make_id: make.id,
        make: make.name,
        model_key: family.key,
        model: family.label,
        year: year ? Number(year) : null,
      })
    }
  }

  const submitVin = (event: FormEvent) => {
    event.preventDefault()

    const clean = vin.replace(/[\s-]+/g, "").toUpperCase()

    if (!VIN_RE.test(clean)) {
      setVinError(true)
      return
    }

    router.push(`/${countryCode}/vin?vin=${clean}`)
  }

  return (
    <section className="ap-section ap-card ap-vp">
      <div className="ap-section-head">
        <h1 className="ap-pdp-title">Підбір за автомобілем</h1>
        <p className={current ? "ap-vp-current" : undefined}>
          {current
            ? `Обране авто: ${current}`
            : "Не вибрано жодного транспортного засобу. Оберіть марку, модель і рік, знайдіть авто фразою, за VIN або кодом двигуна."}
        </p>
      </div>

      <div className="ap-vp-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "pick"}
          className={tab === "pick" ? "ap-on" : undefined}
          onClick={() => setTab("pick")}
        >
          Виберіть
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "recent"}
          className={tab === "recent" ? "ap-on" : undefined}
          onClick={() => setTab("recent")}
        >
          Нещодавно обрані
        </button>
      </div>

      {tab === "recent" ? (
        <div className="ap-vp-recent">
          {!signedIn ? (
            <div className="ap-empty">
              Тут з&apos;являться авто з вашого гаража.{" "}
              <LocalizedClientLink className="ap-link" href="/account">
                Увійдіть, щоб зберегти авто в гараж
              </LocalizedClientLink>
              .
            </div>
          ) : cars.length ? (
            <>
              <ul className="ap-garage-list">
                {cars.map((car) => (
                  <li key={`${car.make_id}|${car.model_key}|${car.year}`}>
                    <span className="ap-garage-car">
                      <strong>{carTitle(car)}</strong>
                      {car.vin && <span>VIN {car.vin}</span>}
                    </span>
                    <button
                      type="button"
                      className="ap-btn"
                      disabled={pending}
                      onClick={() => go(car)}
                    >
                      Показати запчастини
                    </button>
                  </li>
                ))}
              </ul>
              <LocalizedClientLink className="ap-link" href="/account/garage">
                Керувати гаражем
              </LocalizedClientLink>
            </>
          ) : (
            <div className="ap-empty">
              Гараж поки порожній: оберіть авто на вкладці «Виберіть».
            </div>
          )}
        </div>
      ) : (
        <div className="ap-vp-body">
          <form
            className="ap-vp-col ap-vp-left"
            onSubmit={submitPick}
            ref={left}
          >
            <label className="ap-vp-field">
              <span>Вибрати автомобіль</span>
              <input
                type="search"
                value={phrase}
                onChange={(event) => setPhrase(event.target.value)}
                placeholder="Введіть фразу, наприклад Passat"
                autoComplete="off"
              />
            </label>
            {found.asked && (
              <ul className="ap-vp-found">
                {found.loading ? (
                  <li className="ap-vp-hint">Шукаємо…</li>
                ) : found.items.length ? (
                  found.items.map((item) => (
                    <li key={`${item.make_id}|${item.key}`}>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => goMatch(item)}
                      >
                        <strong>
                          {item.make} {item.label}
                        </strong>
                        <small>{years(item.year_from, item.year_to)}</small>
                      </button>
                    </li>
                  ))
                ) : (
                  <li className="ap-vp-hint">Нічого не знайдено</li>
                )}
              </ul>
            )}

            <label className="ap-vp-field">
              <span>Марка</span>
              <select
                value={makeId}
                onChange={(event) => chooseMake(event.target.value)}
              >
                <option value="">Виберіть марку</option>
                {makes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="ap-vp-field">
              <span>Модель</span>
              <select
                value={familyKey}
                disabled={!families?.length}
                onChange={(event) => {
                  setFamilyKey(event.target.value)
                  setYear("")
                }}
              >
                <option value="">
                  {makeId && !families ? "Завантаження…" : "Виберіть модель"}
                </option>
                {families?.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                    {years(item.year_from, item.year_to)
                      ? ` (${years(item.year_from, item.year_to)})`
                      : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="ap-vp-field">
              <span>Рік випуску</span>
              <select
                value={year}
                disabled={!yearList.length}
                onChange={(event) => setYear(event.target.value)}
              >
                <option value="">Усі роки</option>
                {yearList.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="ap-primary"
              disabled={!family || pending}
            >
              {pending ? "Відкриваємо…" : "Показати запчастини"}
            </button>
            {!signedIn && (
              <p className="ap-vp-hint">
                <LocalizedClientLink className="ap-link" href="/account">
                  Увійдіть
                </LocalizedClientLink>
                , щоб зберегти авто в гараж.
              </p>
            )}
          </form>

          <div className="ap-vp-col ap-vp-mid">
            <div
              className="ap-vp-types"
              role="group"
              aria-label="Тип транспорту"
            >
              {TYPES.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  className={type.active ? "ap-on" : undefined}
                  disabled={!type.active}
                  aria-pressed={type.active}
                  title={type.active ? type.label : `${type.label} — незабаром`}
                >
                  <TypeIcon id={type.id} />
                  <span>{type.label}</span>
                </button>
              ))}
            </div>

            <form className="ap-vp-field ap-vp-vin" onSubmit={submitVin}>
              <span>VIN</span>
              <div className="ap-vp-inline">
                <input
                  value={vin}
                  onChange={(event) => {
                    setVin(event.target.value)
                    setVinError(false)
                  }}
                  placeholder="Введіть VIN…"
                  maxLength={24}
                  autoComplete="off"
                  aria-invalid={vinError}
                />
                <button type="submit" aria-label="Шукати за VIN">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    aria-hidden
                  >
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-4-4" />
                  </svg>
                </button>
              </div>
              {vinError && (
                <small className="ap-vp-error">
                  VIN має 17 знаків: латинські літери (без I, O, Q) і цифри.
                </small>
              )}
            </form>

            <label className="ap-vp-field">
              <span>Код двигуна</span>
              <input
                type="search"
                value={engine}
                onChange={(event) => setEngine(event.target.value)}
                placeholder="Наприклад CAYC"
                maxLength={20}
                autoComplete="off"
              />
            </label>
            {engines.asked && (
              <ul className="ap-vp-found">
                {engines.loading ? (
                  <li className="ap-vp-hint">Шукаємо…</li>
                ) : engines.items.length ? (
                  engines.items.map((item) => (
                    <li key={`${item.make_id}|${item.key}|${item.engine_code}`}>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => goMatch(item)}
                      >
                        <strong>
                          {item.make} {item.label}
                        </strong>
                        <small>
                          {[
                            item.engine_code,
                            item.engine,
                            years(item.year_from, item.year_to),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </small>
                      </button>
                    </li>
                  ))
                ) : (
                  <li className="ap-vp-hint">
                    Такого коду двигуна в каталозі немає
                  </li>
                )}
              </ul>
            )}
          </div>

          <div className="ap-vp-col ap-vp-right">
            {popular.length > 0 && (
              <>
                <div className="ap-vp-head">Популярні марки</div>
                <div className="ap-vp-brands">
                  {popular.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={item.id === makeId ? "ap-on" : undefined}
                      onClick={() => chooseBrand(item.id)}
                    >
                      <strong>{item.name}</strong>
                      <small>товарів: {item.products}</small>
                    </button>
                  ))}
                </div>
              </>
            )}
            <div className="ap-vp-head ap-vp-head-all">
              Всі бренди
              {makes.length > 12 && (
                <input
                  type="search"
                  value={allFilter}
                  onChange={(event) => setAllFilter(event.target.value)}
                  placeholder="Знайти марку"
                  aria-label="Знайти марку"
                />
              )}
            </div>
            <div className="ap-vp-all">
              {filtered.length ? (
                filtered.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={item.id === makeId ? "ap-on" : undefined}
                    onClick={() => chooseBrand(item.id)}
                  >
                    <strong>{item.name}</strong>
                    <small>{item.products}</small>
                  </button>
                ))
              ) : (
                <span className="ap-vp-hint">Марку не знайдено</span>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
