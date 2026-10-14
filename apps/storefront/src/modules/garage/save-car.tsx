"use client"

import { clearGarageCar, GarageCar, saveGarageCar } from "@lib/data/garage"
import { useRouter } from "next/navigation"
import { useTransition } from "react"

/** "My car" button on the vehicle picker. */
export function SaveCarButton({ car, saved }: { car: GarageCar; saved: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      className="ap-btn"
      disabled={pending || saved}
      onClick={() =>
        startTransition(async () => {
          await saveGarageCar(car)
          router.refresh()
        })
      }
    >
      {saved ? "✓ Це ваше авто" : "Зберегти як моє авто"}
    </button>
  )
}

/** Removes the saved car. */
export function ForgetCarButton() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      className="ap-garage-x"
      aria-label="Прибрати авто"
      title="Прибрати авто"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await clearGarageCar()
          router.refresh()
        })
      }
    >
      ×
    </button>
  )
}
