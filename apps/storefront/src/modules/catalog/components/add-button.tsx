"use client"

import { addToCart } from "@lib/data/cart"
import { refreshStock } from "@modules/common/components/stock-status"
import { useRouter } from "next/navigation"
import { useTransition } from "react"

type Props = {
  variantId?: string
  countryCode: string
  disabled?: boolean
}

export default function AddButton({ variantId, countryCode, disabled }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      className="ap-add"
      aria-label="Додати в кошик"
      title={disabled ? "Немає в наявності" : "Додати в кошик"}
      disabled={disabled || pending || !variantId}
      onClick={() =>
        startTransition(async () => {
          await addToCart({ variantId: variantId!, quantity: 1, countryCode })
          router.refresh()
          refreshStock()
        })
      }
    >
      {pending ? "…" : "+"}
      <span className="ap-add-text" aria-hidden="true">
        В кошик
      </span>
    </button>
  )
}
