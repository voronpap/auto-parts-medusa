import { redirect } from "next/navigation"

// The garage lives in the account; old links keep working.
export default async function GaragePage(props: {
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await props.params

  redirect(`/${countryCode}/account/garage`)
}
