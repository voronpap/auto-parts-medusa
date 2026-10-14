"use client"

import { startGoogleLogin } from "@lib/data/social-login"
import { useParams } from "next/navigation"
import TelegramButton from "./telegram-button"

/** Sign-in through social accounts; each is shown once the shop has turned it on. */
export default function SocialButtons() {
  const { countryCode } = useParams() as { countryCode: string }
  const google = process.env.NEXT_PUBLIC_GOOGLE_LOGIN === "true"
  const telegram = process.env.NEXT_PUBLIC_TELEGRAM_BOT

  if (!google && !telegram) {
    return null
  }

  return (
    <div className="w-full mt-4 flex flex-col items-center gap-3">
      {google && (
        <form action={startGoogleLogin} className="w-full">
          <button type="submit" className="ap-social">
            <span aria-hidden="true">G</span> Увійти через Google
          </button>
        </form>
      )}
      {telegram && <TelegramButton bot={telegram} countryCode={countryCode || "ua"} />}
    </div>
  )
}
