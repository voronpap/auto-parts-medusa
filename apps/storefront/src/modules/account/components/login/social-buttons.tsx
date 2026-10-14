import { startGoogleLogin } from "@lib/data/social-login"

/** Sign-in through social accounts; shown once the shop has turned it on. */
export default function SocialButtons() {
  if (process.env.NEXT_PUBLIC_GOOGLE_LOGIN !== "true") {
    return null
  }

  return (
    <form action={startGoogleLogin} className="w-full mt-4">
      <button type="submit" className="ap-social">
        <span aria-hidden="true">G</span> Увійти через Google
      </button>
    </form>
  )
}
