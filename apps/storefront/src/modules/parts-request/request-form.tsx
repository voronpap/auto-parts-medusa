"use client"

import { sendPartsRequest } from "@lib/data/parts-requests"
import { useActionState } from "react"

/** "Not found? We will pick it for you" — a request to the shop's manager. */
export default function PartsRequestForm({ vin }: { vin?: string }) {
  const [state, action, pending] = useActionState(sendPartsRequest, { ok: false, error: null })

  if (state.ok) {
    return (
      <div className="ap-fit ap-fit-yes">
        Дякуємо! Менеджер підбере деталь і зателефонує вам найближчим часом.
      </div>
    )
  }

  return (
    <form className="ap-request" action={action}>
      <div className="ap-request-row">
        <label>
          Ваше ім'я
          <input name="name" required maxLength={100} autoComplete="name" />
        </label>
        <label>
          Телефон
          <input name="phone" required inputMode="tel" maxLength={30} autoComplete="tel" placeholder="+380…" />
        </label>
      </div>
      <div className="ap-request-row">
        <label>
          VIN (необов'язково)
          <input name="vin" defaultValue={vin} maxLength={17} placeholder="17 символів" />
        </label>
        <label>
          Авто (марка, модель, рік, двигун)
          <input name="car" maxLength={200} />
        </label>
      </div>
      <label>
        Що потрібно
        <textarea name="message" required minLength={3} maxLength={2000} rows={3} placeholder="Наприклад: колодки передні та диски" />
      </label>
      {/* Left empty by people; filled only by robots. */}
      <input className="ap-hidden" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      {state.error && <div className="ap-fit ap-fit-none">{state.error}</div>}
      <button className="ap-btn" type="submit" disabled={pending}>
        {pending ? "Надсилаю…" : "Надіслати запит"}
      </button>
    </form>
  )
}
