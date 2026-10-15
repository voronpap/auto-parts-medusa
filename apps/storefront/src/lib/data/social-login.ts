"use server"

import { sdk } from "@lib/config"
import { revalidateTag } from "next/cache"
import { redirect } from "next/navigation"
import {
  getCacheTag,
  getSocialSignupToken,
  removeSocialSignupToken,
  setAuthToken,
  setSocialSignupToken,
} from "./cookies"
import { transferCart } from "./customer"
import { loadGarageFromAccount } from "./garage"

type TokenPayload = {
  actor_id?: string
  auth_provider?: string
  user_metadata?: {
    email?: string
    given_name?: string
    family_name?: string
    telegram_id?: string
    first_name?: string | null
    last_name?: string | null
  }
}

/** How a return from Google or Telegram ended. */
export type SocialResult = "signed-in" | "complete-signup" | "failed"

/** What the provider told us about a shopper who has no account yet. */
export type SocialSignup = {
  provider: "google" | "telegram"
  email: string
  first_name: string
  last_name: string
}

export type SocialSignupState = { error: string } | null

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

/** Signs in with a customer-bound token, the same way the e-mail sign-in ends. */
async function signIn(token: string) {
  await removeSocialSignupToken()
  await setAuthToken(token)
  await loadGarageFromAccount().catch(() => undefined)
  revalidateTag(await getCacheTag("customers"))
  await transferCart().catch(() => undefined)
}

/**
 * A shopper who already has an account is signed in straight away. A first
 * sign-in creates nothing: the token waits until the shopper confirms the
 * details on the form that finishes the sign-up.
 */
async function afterProvider(token: string): Promise<SocialResult> {
  if (payloadOf(token).actor_id) {
    await signIn(token)
    return "signed-in"
  }

  await setSocialSignupToken(token)
  return "complete-signup"
}

/** Google has sent the shopper back. */
export async function finishGoogleLogin(query: Record<string, string>): Promise<SocialResult> {
  try {
    const result = await sdk.auth.callback("customer", "google", query)

    // A second factor is not offered with Google sign-in.
    if (typeof result !== "string") {
      return "failed"
    }

    return await afterProvider(result)
  } catch {
    return "failed"
  }
}

/** Telegram has sent the shopper back with signed data. */
export async function finishTelegramLogin(query: Record<string, string>): Promise<SocialResult> {
  try {
    const result = await sdk.auth.login("customer", "telegram", query)

    if (typeof result !== "string") {
      return "failed"
    }

    return await afterProvider(result)
  } catch {
    return "failed"
  }
}

/** The details for the form that finishes a sign-up, or null when none is waiting. */
export async function getSocialSignup(): Promise<SocialSignup | null> {
  const token = await getSocialSignupToken()

  if (!token) {
    return null
  }

  const payload = payloadOf(token)
  const meta = payload.user_metadata ?? {}

  if (payload.auth_provider === "telegram") {
    return {
      provider: "telegram",
      email: "",
      first_name: meta.first_name ?? "",
      last_name: meta.last_name ?? "",
    }
  }

  return {
    provider: "google",
    email: meta.email ?? "",
    first_name: meta.given_name ?? "",
    last_name: meta.family_name ?? "",
  }
}

/**
 * The shopper pressed "Створити обліковий запис": create the customer for the
 * waiting token, then sign in as usual. Telegram gives no e-mail, so the
 * shopper types one; without an e-mail no account is created.
 */
export async function completeSocialSignup(
  _state: SocialSignupState,
  formData: FormData
): Promise<SocialSignupState> {
  const token = await getSocialSignupToken()
  const signup = await getSocialSignup()

  if (!token || !signup) {
    return { error: "Час на реєстрацію минув. Увійдіть через Google або Telegram ще раз." }
  }

  if (formData.get("consent") !== "on") {
    return { error: "Потрібна ваша згода з обробкою персональних даних і правилами." }
  }

  const text = (name: string) => String(formData.get(name) ?? "").trim()
  // An address the provider confirmed is shown read-only and kept as is.
  const email = signup.email || text("email")

  if (!email) {
    return { error: "Вкажіть email." }
  }

  try {
    await sdk.store.customer.create(
      {
        email,
        first_name: text("first_name") || undefined,
        last_name: text("last_name") || undefined,
        phone: text("phone") || undefined,
      },
      {},
      { Authorization: `Bearer ${token}` }
    )
  } catch (error) {
    if (/already (exists|has an account)/i.test((error as Error)?.message ?? "")) {
      return {
        error: signup.email
          ? "На цей email уже є обліковий запис. Увійдіть за email і паролем."
          : "На цей email уже є обліковий запис. Увійдіть за email і паролем або вкажіть інший email.",
      }
    }

    return { error: "Не вдалося створити обліковий запис. Спробуйте ще раз за хвилину." }
  }

  // The refresh gives a token that now carries the new customer. This SDK
  // version answers with `{ token }`, older ones with the bare string.
  let refreshed: string | undefined

  try {
    const result: unknown = await sdk.auth.refresh({ Authorization: `Bearer ${token}` })
    refreshed = typeof result === "string" ? result : (result as { token?: string })?.token
  } catch {
    refreshed = undefined
  }

  if (!refreshed) {
    await removeSocialSignupToken()
    return { error: "Обліковий запис створено. Увійдіть ще раз через Google або Telegram." }
  }

  await signIn(refreshed)
  redirect(`/${text("country_code") || "ua"}/account`)
}

/** "Скасувати": forget the waiting token, create nothing. */
export async function cancelSocialSignup(formData: FormData) {
  await removeSocialSignupToken()
  redirect(`/${String(formData.get("country_code") || "ua")}/account`)
}
