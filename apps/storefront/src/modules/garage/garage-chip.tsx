import { isSignedIn, listGarage } from "@lib/data/garage"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { ForgetCarButton } from "./save-car"

/** The chosen car in the header (it leads to the garage), or a way to choose one. */
export default async function GarageChip() {
  const [{ active: car, cars }, signedIn] = await Promise.all([
    listGarage(),
    isSignedIn(),
  ])

  // A guest signs in first (the garage is for registered shoppers); a shopper
  // with an empty garage picks a car.
  if (!car) {
    return (
      <LocalizedClientLink
        className="ap-garage"
        href={
          !signedIn ? "/account" : cars.length ? "/account/garage" : "/cars"
        }
        title={signedIn ? "Мій гараж" : "Увійдіть, щоб зберегти своє авто"}
      >
        Моє авто
      </LocalizedClientLink>
    )
  }

  const more = cars.length - 1

  return (
    <span className="ap-garage ap-on">
      <LocalizedClientLink href="/account/garage" title="Мій гараж">
        {[car.make, car.model, car.year].filter(Boolean).join(" ")}
        {more > 0 && <span className="ap-garage-more"> +{more}</span>}
      </LocalizedClientLink>
      <ForgetCarButton />
    </span>
  )
}
