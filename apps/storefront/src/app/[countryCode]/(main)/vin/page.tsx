import { redirect } from "next/navigation"

import { lookupVin } from "@lib/data/parts-catalog"
import { tecdocCarPath } from "@lib/data/tecdoc-resolve"

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/

/**
 * There is no VIN page: a VIN typed in the vehicle picker or the header
 * search is read here and the shopper lands on the car it names in "Підбір
 * за авто", in the TecDoc tree — the model when the VIN tells it, else the
 * make (with the likely models first), else the picker with a note. Old
 * links to /vin keep working.
 */
export default async function VinPage(props: {
  params: Promise<{ countryCode: string }>
  searchParams: Promise<{ vin?: string }>
}) {
  const { countryCode } = await props.params
  const { vin: typed } = await props.searchParams
  const cars = `/${countryCode}/cars`
  const vin = (typed ?? "").replace(/[\s-]+/g, "").toUpperCase()

  if (!vin) {
    redirect(cars)
  }

  if (!VIN_RE.test(vin)) {
    redirect(`${cars}?vin=${encodeURIComponent(vin)}&vin_error=format`)
  }

  const result = await lookupVin(vin)
  const vehicle = result?.vehicle

  if (!result || !vehicle?.make) {
    redirect(`${cars}?vin=${vin}&vin_error=${result ? "unknown" : "lookup"}`)
  }

  // Position ten names two years 30 years apart (B is 2011 or 1981); the
  // newest is the likely one.
  const path = await tecdocCarPath({
    make: vehicle.make,
    models: vehicle.models,
    label: vehicle.family?.label,
    year: vehicle.years[0] ?? null,
    vin,
  })

  redirect(path ? `/${countryCode}${path}` : `${cars}?vin=${vin}&vin_error=unknown`)
}
