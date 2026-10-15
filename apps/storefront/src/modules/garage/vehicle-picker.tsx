"use client"

import { chooseGarageCar, GarageEntry } from "@lib/data/garage"
import { VehicleFamily, VehicleMake } from "@lib/data/parts-catalog"
import { pickerFamilies } from "@lib/data/vehicle-picker"
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

/**
 * The cars page before a make is chosen: make, model and year lists, a
 * VIN, popular and all makes. Choosing a car
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
  const [vin, setVin] = useState("")
  const [vinError, setVinError] = useState(false)
  const [makeId, setMakeId] = useState("")
  const [families, setFamilies] = useState<VehicleFamily[] | null>(null)
  const [familyKey, setFamilyKey] = useState("")
  const [year, setYear] = useState("")
  const [allFilter, setAllFilter] = useState("")
  const [pending, startTransition] = useTransition()
  const left = useRef<HTMLDivElement>(null)

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
            : "Не вибрано жодного транспортного засобу. Оберіть марку, модель і рік або введіть VIN."}
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
          <div className="ap-vp-col ap-vp-left" ref={left}>
            <form className="ap-vp-pick" onSubmit={submitPick}>
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
            </form>

            <div className="ap-vp-or" aria-hidden>
              <span>або</span>
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

            {!signedIn && (
              <p className="ap-vp-hint">
                <LocalizedClientLink className="ap-link" href="/account">
                  Увійдіть
                </LocalizedClientLink>
                , щоб зберегти авто в гараж.
              </p>
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
