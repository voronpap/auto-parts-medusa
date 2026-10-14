"use server"

import { cookies } from "next/headers"

/** The shopper's car, kept in a cookie so every page can check fitment. */
export type GarageCar = {
  make_id: string
  make: string
  model_key: string | null
  model: string | null
  /** Exact model names of the family, as the catalog writes them. */
  names: string[]
  year: number | null
}

const COOKIE = "_ap_car"

export async function getGarageCar(): Promise<GarageCar | null> {
  const raw = (await cookies()).get(COOKIE)?.value

  if (!raw) {
    return null
  }

  try {
    const car = JSON.parse(raw) as GarageCar

    return car?.make_id && car.make ? car : null
  } catch {
    return null
  }
}

export async function saveGarageCar(car: GarageCar) {
  // A cookie holds about 4 KB; a long family keeps its first names.
  const value = JSON.stringify({ ...car, names: car.names.slice(0, 25) })

  ;(await cookies()).set(COOKIE, value, {
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  })
}

export async function clearGarageCar() {
  ;(await cookies()).delete(COOKIE)
}
