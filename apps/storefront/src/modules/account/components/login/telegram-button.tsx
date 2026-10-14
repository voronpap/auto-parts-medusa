"use client"

import { useEffect, useRef } from "react"

/**
 * Telegram's own login button. After the shopper confirms in Telegram, the
 * browser comes back to /auth/telegram with the signed data.
 */
export default function TelegramButton({ bot, countryCode }: { bot: string; countryCode: string }) {
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const holder = box.current

    if (!holder || holder.childElementCount) {
      return
    }

    const script = document.createElement("script")
    script.async = true
    script.src = "https://telegram.org/js/telegram-widget.js?22"
    script.setAttribute("data-telegram-login", bot)
    script.setAttribute("data-size", "large")
    script.setAttribute("data-radius", "8")
    script.setAttribute("data-request-access", "write")
    script.setAttribute("data-auth-url", `${window.location.origin}/${countryCode}/auth/telegram`)
    holder.appendChild(script)
  }, [bot, countryCode])

  return <div ref={box} className="ap-telegram" />
}
