import { Metadata } from "next"

import { GarageEntry, listGarage } from "@lib/data/garage"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { ChooseCarButton, RemoveCarButton } from "@modules/garage/save-car"

export const metadata: Metadata = {
  title: "Мій гараж",
  description: "Ваші авто: оберіть одне, і на сторінках товарів буде видно, чи підходить деталь.",
}

const carName = (car: GarageEntry) =>
  `${car.make} ${car.model ?? ""} ${car.year ?? ""}`.replace(/\s+/g, " ").trim()

const partsHref = (car: GarageEntry) =>
  `/cars?make=${car.make_id}${car.model_key ? `&model=${encodeURIComponent(car.model_key)}` : ""}${car.year ? `&year=${car.year}` : ""}`

export default async function GaragePage() {
  const { active, cars } = await listGarage()
  const isActive = (car: GarageEntry) =>
    Boolean(
      active &&
        active.make_id === car.make_id &&
        (active.model_key ?? null) === (car.model_key ?? null) &&
        (active.year ?? null) === (car.year ?? null)
    )

  return (
    <div className="ap-scope ap-page">
      <div className="ap-shell">
        <section className="ap-section ap-card">
          <div className="ap-section-head">
            <h1 className="ap-pdp-title">Мій гараж</h1>
            <p>
              Оберіть авто — на сторінці кожного товару буде видно, чи
              підходить деталь саме на нього. Можна зберегти до 5 авто.
            </p>
          </div>

          {cars.length ? (
            <ul className="ap-garage-list">
              {cars.map((car) => (
                <li key={`${car.make_id}|${car.model_key}|${car.year}`} className={isActive(car) ? "ap-on" : ""}>
                  <div className="ap-garage-car">
                    <strong>{carName(car)}</strong>
                    <span>
                      {isActive(car) ? "Обране авто" : car.model ? "" : "Модель не вказано"}
                      {car.vin ? ` · VIN ${car.vin}` : ""}
                    </span>
                  </div>
                  <div className="ap-garage-actions">
                    <LocalizedClientLink className="ap-link" href={partsHref(car)}>
                      Запчастини
                    </LocalizedClientLink>
                    {!isActive(car) && <ChooseCarButton car={car} />}
                    <RemoveCarButton car={car} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ap-lead">У гаражі поки немає авто.</p>
          )}

          <div className="ap-garage-add">
            <LocalizedClientLink className="ap-btn" href="/cars">
              Додати авто за маркою
            </LocalizedClientLink>
            <LocalizedClientLink className="ap-link" href="/vin">
              Додати за VIN
            </LocalizedClientLink>
          </div>
        </section>
      </div>
    </div>
  )
}
