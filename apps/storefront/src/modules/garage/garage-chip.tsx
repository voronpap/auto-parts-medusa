import { listGarage } from "@lib/data/garage"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { ForgetCarButton } from "./save-car"

/** The chosen car in the header (it leads to the garage), or a way to choose one. */
export default async function GarageChip() {
  const { active: car, cars } = await listGarage()

  if (!car) {
    return (
      <LocalizedClientLink className="ap-garage" href={cars.length ? "/garage" : "/cars"}>
        Моє авто
      </LocalizedClientLink>
    )
  }

  const more = cars.length - 1

  return (
    <span className="ap-garage ap-on">
      <LocalizedClientLink href="/garage" title="Мій гараж">
        {car.make} {car.model ?? ""} {car.year ?? ""}
        {more > 0 && <span className="ap-garage-more"> +{more}</span>}
      </LocalizedClientLink>
      <ForgetCarButton />
    </span>
  )
}
