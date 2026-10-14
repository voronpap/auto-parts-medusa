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
