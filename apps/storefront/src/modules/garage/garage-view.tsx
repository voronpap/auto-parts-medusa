import { GarageEntry, listGarage } from "@lib/data/garage"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { ChooseCarButton, RemoveCarButton } from "./save-car"

const carName = (car: GarageEntry) =>
  `${car.make} ${car.model ?? ""} ${car.year ?? ""}`.replace(/\s+/g, " ").trim()

const partsHref = (car: GarageEntry) =>
  `/cars?make=${car.make_id}${
    car.model_key ? `&model=${encodeURIComponent(car.model_key)}` : ""
  }${car.year ? `&year=${car.year}` : ""}`

/** The shopper's saved cars: choose one, open its parts, remove it. */
export default async function GarageView() {
  const { active, cars } = await listGarage()
  const isActive = (car: GarageEntry) =>
    Boolean(
      active &&
        active.make_id === car.make_id &&
        (active.model_key ?? null) === (car.model_key ?? null) &&
        (active.year ?? null) === (car.year ?? null)
    )

  return (
    <div className="ap-scope">
      <section className="ap-section">
        <div className="ap-section-head">
          <h1 className="text-2xl-semi">Мій гараж</h1>
          <p>
            Оберіть авто — на сторінці кожного товару буде видно, чи підходить
            деталь саме на нього. Можна зберегти до 5 авто.
          </p>
        </div>

        {cars.length ? (
          <ul className="ap-garage-list">
            {cars.map((car) => (
              <li
                key={`${car.make_id}|${car.model_key}|${car.year}`}
                className={isActive(car) ? "ap-on" : ""}
              >
                <div className="ap-garage-car">
                  <strong>{carName(car)}</strong>
                  <span>
                    {[
                      isActive(car) ? "Обране авто" : null,
                      car.model ? null : "Модель не вказано",
                      car.vin ? `VIN ${car.vin}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                <div className="ap-garage-actions">
                  <LocalizedClientLink
                    className="ap-link"
                    href={partsHref(car)}
                  >
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
            Додати авто
          </LocalizedClientLink>
          <LocalizedClientLink className="ap-link" href="/cars">
            Додати за VIN
          </LocalizedClientLink>
        </div>
      </section>
    </div>
  )
}
