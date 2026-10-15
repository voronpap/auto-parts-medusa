"use client"

import { cancelSocialSignup, completeSocialSignup, SocialSignup } from "@lib/data/social-login"
import ErrorMessage from "@modules/checkout/components/error-message"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import Input from "@modules/common/components/input"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { useParams } from "next/navigation"
import { useActionState } from "react"

const PROVIDER = { google: "Google", telegram: "Telegram" } as const

/**
 * Finishes a first sign-in through Google or Telegram: the shopper checks the
 * details the provider gave, agrees to the terms and only then gets an account.
 */
export default function SocialSignupForm({ signup }: { signup: SocialSignup }) {
  const { countryCode } = useParams() as { countryCode: string }
  const [message, formAction] = useActionState(completeSocialSignup, null)
  const telegram = signup.provider === "telegram"

  return (
    <div className="max-w-sm w-full flex flex-col items-center" data-testid="social-signup-page">
      <h1 className="text-large-semi uppercase mb-6">Реєстрація</h1>
      <div className="w-full mb-6 rounded-rounded bg-ui-bg-subtle border border-ui-border-base p-4 text-base-regular">
        Ви реєструєте обліковий запис за допомогою {PROVIDER[signup.provider]}.
        <form action={cancelSocialSignup} className="mt-1">
          <input type="hidden" name="country_code" value={countryCode} />
          <button type="submit" className="underline text-small-regular" data-testid="social-signup-cancel">
            Скасувати
          </button>
        </form>
      </div>
      <form className="w-full flex flex-col" action={formAction}>
        <input type="hidden" name="country_code" value={countryCode} />
        <div className="flex flex-col w-full gap-y-2">
          <Input
            label="Ім'я"
            name="first_name"
            required
            autoComplete="given-name"
            defaultValue={signup.first_name}
            data-testid="first-name-input"
          />
          <Input
            label="Прізвище"
            name="last_name"
            required
            autoComplete="family-name"
            defaultValue={signup.last_name}
            data-testid="last-name-input"
          />
          <Input
            label={telegram ? "Email (необов'язковий)" : "Email"}
            name="email"
            type="email"
            required={!telegram}
            autoComplete="email"
            defaultValue={signup.email}
            readOnly={Boolean(signup.email)}
            data-testid="email-input"
          />
          <Input
            label="Номер телефону (необов'язковий)"
            name="phone"
            type="tel"
            autoComplete="tel"
            data-testid="phone-input"
          />
        </div>
        <label className="flex items-start gap-x-2 mt-6 text-small-regular text-ui-fg-base">
          <input type="checkbox" name="consent" required className="mt-1" data-testid="consent-checkbox" />
          <span>
            Я погоджуюся з{" "}
            <LocalizedClientLink href="/info/privacy" className="underline">
              обробкою персональних даних
            </LocalizedClientLink>{" "}
            та{" "}
            <LocalizedClientLink href="/info/offer" className="underline">
              правилами й умовами обслуговування
            </LocalizedClientLink>
            .
          </span>
        </label>
        <ErrorMessage error={message?.error ?? null} data-testid="social-signup-error" />
        <SubmitButton className="w-full mt-6" data-testid="social-signup-button">
          Створити обліковий запис
        </SubmitButton>
      </form>
    </div>
  )
}
