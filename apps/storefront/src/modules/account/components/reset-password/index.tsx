"use client"

import { useActionState } from "react"
import { useSearchParams } from "next/navigation"
import { resetPassword } from "@lib/data/customer"
import ErrorMessage from "@modules/checkout/components/error-message"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import Input from "@modules/common/components/input"
import { Button } from "@modules/common/components/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

const ResetPassword = () => {
  const searchParams = useSearchParams()
  const token = searchParams.get("token")
  const email = searchParams.get("email")
  const [message, formAction] = useActionState(resetPassword, null)

  return (
    <div
      className="max-w-sm w-full flex flex-col items-center text-center gap-y-4"
      data-testid="reset-password-page"
    >
      <h1 className="text-large-semi uppercase">Set a new password</h1>

      {(!token || !email) && (
        <>
          <p className="text-base-regular text-ui-fg-base">
            This reset link is invalid or has expired. Request a new one from
            the sign in page.
          </p>
          <LocalizedClientLink href="/account">
            <Button variant="secondary">Go to sign in</Button>
          </LocalizedClientLink>
        </>
      )}

      {token && email && message?.state === "success" && (
        <>
          <p className="text-base-regular text-ui-fg-base">
            Your password has been changed. You can now sign in.
          </p>
          <LocalizedClientLink href="/account">
            <Button variant="primary">Go to sign in</Button>
          </LocalizedClientLink>
        </>
      )}

      {token && email && message?.state !== "success" && (
        <form className="w-full text-left" action={formAction}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="email" value={email} />
          <div className="flex flex-col w-full gap-y-2">
            <Input
              label="New password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              data-testid="new-password-input"
            />
            <Input
              label="Confirm password"
              name="confirm_password"
              type="password"
              autoComplete="new-password"
              required
              data-testid="confirm-password-input"
            />
          </div>
          <ErrorMessage
            error={message?.state === "error" ? message.error : null}
            data-testid="reset-password-error-message"
          />
          <SubmitButton
            data-testid="reset-password-button"
            className="w-full mt-6"
          >
            Save password
          </SubmitButton>
        </form>
      )}
    </div>
  )
}

export default ResetPassword
