"use server"

import { sdk } from "@lib/config"

export type PartsRequestState = { ok: boolean; error: string | null }

/** Sends the "pick a part for me" form to the shop. */
export async function sendPartsRequest(
  _: PartsRequestState,
  form: FormData
): Promise<PartsRequestState> {
  const text = (name: string) => String(form.get(name) ?? "").trim()

  try {
    await sdk.client.fetch("/store/parts-requests", {
      method: "POST",
      body: {
        name: text("name"),
        phone: text("phone"),
        vin: text("vin") || null,
        car: text("car") || null,
        message: text("message"),
        website: text("website"),
      },
    })

    return { ok: true, error: null }
  } catch {
    return {
      ok: false,
      error: "Не вдалося надіслати. Перевірте телефон і VIN (17 символів) або напишіть коротше.",
    }
  }
}
