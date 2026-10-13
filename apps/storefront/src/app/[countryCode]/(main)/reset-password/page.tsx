import { Metadata } from "next"
import { Suspense } from "react"

import ResetPassword from "@modules/account/components/reset-password"

export const metadata: Metadata = {
  title: "Новий пароль",
  description: "Встановлення нового пароля.",
}

export default function ResetPasswordPage() {
  return (
    <div className="w-full flex justify-center px-8 py-12">
      <Suspense
        fallback={
          <p className="text-base-regular text-ui-fg-base">Завантаження…</p>
        }
      >
        <ResetPassword />
      </Suspense>
    </div>
  )
}
