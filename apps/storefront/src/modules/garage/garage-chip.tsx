import { getGarageCar } from "@lib/data/garage"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { ForgetCarButton } from "./save-car"

/** The saved car in the header, or a way to choose one. */
export default async function GarageChip() {
  const car = await getGarageCar()

  if (!car) {
    return (
      <LocalizedClientLink className="ap-garage" href="/cars">
        Моє авто
      </LocalizedClientLink>
    )
  }

  const href = `/cars?make=${car.make_id}${car.model_key ? `&model=${encodeURIComponent(car.model_key)}` : ""}${car.year ? `&year=${car.year}` : ""}`

  return (
    <span className="ap-garage ap-on">
      <LocalizedClientLink href={href}>
        {car.make} {car.model ?? ""} {car.year ?? ""}
      </LocalizedClientLink>
      <ForgetCarButton />
    </span>
  )
}
