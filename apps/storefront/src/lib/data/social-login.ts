"use server"

import { sdk } from "@lib/config"
import { redirect } from "next/navigation"
import { setAuthToken } from "./cookies"
import { transferCart } from "./customer"

type TokenPayload = { actor_id?: string; user_metadata?: { email?: string; given_name?: string; family_name?: string } }

const payloadOf = (token: string): TokenPayload => {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"))
  } catch {
    return {}
  }
}

/** Sends the shopper to Google to sign in. */
export async function startGoogleLogin() {
  const result = await sdk.auth.login("customer", "google", {})

  if (typeof result === "object" && "location" in result && result.location) {
    redirect(result.location)
  }

  redirect("/account?social=failed")
}

/**
 * Google has sent the shopper back. A first sign-in also creates the
 * shop's customer from the e-mail and name Google gave.
 */
export async function finishGoogleLogin(query: Record<string, string>): Promise<boolean> {
  let token: string

  try {
    const result = await sdk.auth.callback("customer", "google", query)

    // A second factor is not offered with Google sign-in.
    if (typeof result !== "string") {
      return false
    }

    token = result
  } catch {
    return false
  }

  const payload = payloadOf(token)

  if (!payload.actor_id) {
    const meta = payload.user_metadata ?? {}

    if (!meta.email) {
      return false
    }

    await sdk.store.customer.create(
      { email: meta.email, first_name: meta.given_name, last_name: meta.family_name },
      {},
      { Authorization: `Bearer ${token}` }
    )
    const refreshed = await sdk.auth.refresh({ Authorization: `Bearer ${token}` })

    if (typeof refreshed !== "string") {
      return false
    }

    token = refreshed
  }

  await setAuthToken(token)
  await transferCart().catch(() => undefined)

  return true
}

/**
 * Telegram has sent the shopper back with signed data. Telegram gives no
 * e-mail, so a first sign-in creates the customer with an address made
 * from the Telegram id, which the shopper can change in the account.
 */
export async function finishTelegramLogin(query: Record<string, string>): Promise<boolean> {
  let token: string

  try {
    const result = await sdk.auth.login("customer", "telegram", query)

    if (typeof result !== "string") {
      return false
    }

    token = result
  } catch {
    return false
  }

  const payload = payloadOf(token) as TokenPayload & {
    user_metadata?: { telegram_id?: string; first_name?: string | null; last_name?: string | null }
  }

  if (!payload.actor_id) {
    const meta = payload.user_metadata ?? {}
    const id = meta.telegram_id ?? query.id

    if (!id) {
      return false
    }

    await sdk.store.customer.create(
      {
        email: `tg-${id}@telegram.auto-parts.pp.ua`,
        first_name: meta.first_name ?? undefined,
        last_name: meta.last_name ?? undefined,
      },
      {},
      { Authorization: `Bearer ${token}` }
    )
    const refreshed = await sdk.auth.refresh({ Authorization: `Bearer ${token}` })

    if (typeof refreshed !== "string") {
      return false
    }

    token = refreshed
  }

  await setAuthToken(token)
  await transferCart().catch(() => undefined)

  return true
}
