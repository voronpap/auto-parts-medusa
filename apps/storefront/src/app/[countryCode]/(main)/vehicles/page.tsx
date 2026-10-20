import { permanentRedirect } from "next/navigation"

/** The TecDoc tree moved into the cars page; old addresses keep working. */
export default async function VehiclesPage(props: {
  params: Promise<{ countryCode: string }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const { countryCode } = await props.params
  const search = await props.searchParams
  const query = new URLSearchParams(
    ["make", "model", "ktype", "group", "offset"]
      .filter((key) => search[key])
      .map((key) => [key, search[key]!])
  ).toString()

  permanentRedirect(`/${countryCode}/cars${query ? `?${query}` : ""}`)
}
