import { getGarageCar } from "@lib/data/garage"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { ForgetCarButton } from "./save-car"

/** "Choose a vehicle" in the header: the chosen car, or the way to the cars page. */
export default async function GarageChip() {
  const car = await getGarageCar()

  return (
    <span className={car ? "ap-garage ap-on" : "ap-garage"}>
      <LocalizedClientLink
        className="ap-vp-open"
        href="/cars"
        title={car ? "Змінити авто" : "Виберіть транспорт"}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 34 34"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M4 21v-5l3-6c.4-.8 1.2-1.3 2.1-1.3h15.8c.9 0 1.7.5 2.1 1.3l3 6v5z" />
          <path d="M4 16h26M9 21v3M25 21v3" />
        </svg>
        <span>
          {car
            ? [car.make, car.model, car.year].filter(Boolean).join(" ")
            : "Виберіть транспорт"}
        </span>
      </LocalizedClientLink>
      {car && <ForgetCarButton />}
    </span>
  )
}
