import { finishGoogleLogin } from "@lib/data/social-login"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function GoogleCallback(props: {
  params: Promise<{ countryCode: string }>
  searchParams: Promise<Record<string, string>>
}) {
  const [{ countryCode }, query] = await Promise.all([props.params, props.searchParams])
  const ok = await finishGoogleLogin(query)

  if (ok) {
    redirect(`/${countryCode}/account`)
  }

  return (
    <div className="ap-scope ap-page">
      <div className="ap-shell">
        <section className="ap-section ap-card">
          <h1 className="ap-pdp-title">Не вдалося увійти через Google</h1>
          <p>Спробуйте ще раз або увійдіть за e-mail і паролем.</p>
          <LocalizedClientLink className="ap-link" href="/account">
            Повернутися до входу
          </LocalizedClientLink>
        </section>
      </div>
    </div>
  )
}
