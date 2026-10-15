import { getSocialSignup } from "@lib/data/social-login"
import SocialSignupForm from "@modules/account/components/social-signup"
import { Metadata } from "next"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Завершення реєстрації",
  robots: { index: false },
}

export default async function CompleteSignup(props: { params: Promise<{ countryCode: string }> }) {
  const [{ countryCode }, signup] = await Promise.all([props.params, getSocialSignup()])

  // Nothing waits here: the time ran out, the form was sent or the visitor came by link.
  if (!signup) {
    redirect(`/${countryCode}/account`)
  }

  return (
    <div className="w-full flex justify-center px-6 py-10">
      <SocialSignupForm signup={signup} />
    </div>
  )
}
