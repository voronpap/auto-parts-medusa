import type { GarageCar } from "@lib/data/garage"
import type { PartsCatalogInfo } from "@lib/data/parts-catalog"

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * Whether the catalog lists this part for the saved car. Only what a source
 * stated counts; no data is said as no data, not as "does not fit".
 */
export function fitFor(car: GarageCar, fitment: PartsCatalogInfo["fitment"]) {
  const make = fitment.find((item) => same(item.make, car.make))

  if (!make) {
    return "unknown" as const
  }

  if (!car.names.length && !car.model) {
    return "make" as const
  }

  const models = make.models.filter(
    (item) =>
      car.names.some((name) => same(name, item.model)) ||
      (car.model ? item.model.toLowerCase().includes(car.model.toLowerCase()) : false)
  )
  const inYear = car.year
    ? models.filter(
        (item) =>
          (item.year_from == null || item.year_from <= car.year!) &&
          (item.year_to == null || item.year_to >= car.year!)
      )
    : models

  if (!inYear.length) {
    return "unknown" as const
  }

  return inYear.some((item) => item.conditional) ? ("conditional" as const) : ("fits" as const)
}

export default function FitBadge({ car, fitment }: { car: GarageCar | null; fitment: PartsCatalogInfo["fitment"] }) {
  if (!car) {
    return null
  }

  const name = `${car.make} ${car.model ?? ""} ${car.year ?? ""}`.trim()
  const fit = fitFor(car, fitment)

  if (fit === "fits") {
    return <div className="ap-fit ap-fit-yes">✓ Підходить на ваш {name}</div>
  }

  if (fit === "conditional") {
    return <div className="ap-fit ap-fit-maybe">Підходить на ваш {name} за умов — дивіться застосовність</div>
  }

  if (fit === "make") {
    return <div className="ap-fit ap-fit-maybe">Є застосовність для {car.make} — уточніть модель</div>
  }

  return <div className="ap-fit ap-fit-none">Немає даних, що деталь підходить на ваш {name}</div>
}
