import { notFound } from "next/navigation"

import { getRegion } from "@lib/data/regions"

/**
 * Only shop countries are pages. "/.env", "/api" or "/manifest.json" reach
 * this segment as a "country" and must answer 404, not the home page.
 */
export default async function CountryLayout(props: {
  children: React.ReactNode
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await props.params
  const region = await getRegion(countryCode).catch(() => null)

  if (!region) {
    notFound()
  }

  return props.children
}
