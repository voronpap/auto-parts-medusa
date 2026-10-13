import { Metadata } from "next"

import InteractiveLink from "@modules/common/components/interactive-link"

export const metadata: Metadata = {
  title: "404",
  description: "Щось пішло не так",
}

export default function NotFound() {
  return (
    <div className="flex flex-col gap-4 items-center justify-center min-h-[calc(100vh-64px)]">
      <h1 className="text-2xl-semi text-ui-fg-base">Сторінку не знайдено</h1>
      <p className="text-small-regular text-ui-fg-base">
        Сторінки, яку ви шукаєте, не існує.
      </p>
      <InteractiveLink href="/">На головну</InteractiveLink>
    </div>
  )
}
