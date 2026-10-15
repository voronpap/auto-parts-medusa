"use server"

import { cookies } from "next/headers"
import { retrieveVehicleMake } from "./parts-catalog"

/** The shopper's car, kept in a cookie so every page can check fitment. */
export type GarageCar = {
  make_id: string
  make: string
  model_key: string | null
  model: string | null
  /** Exact model names of the family, as the catalog writes them. */
  names: string[]
  year: number | null
  /** The VIN the car was found by, when it was. */
  vin?: string | null
}

/** A car in the garage list; model names are looked up again when it is chosen. */
export type GarageEntry = Omit<GarageCar, "names">

// The chosen car (with its model names) and the list of all saved cars.
const COOKIE = "_ap_car"
const LIST_COOKIE = "_ap_cars"
const LIMIT = 5

const OPTIONS = {
  maxAge: 60 * 60 * 24 * 365,
  httpOnly: false,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
}

const sameCar = (a: GarageEntry, b: GarageEntry) =>
  a.make_id === b.make_id &&
  (a.model_key ?? null) === (b.model_key ?? null) &&
  (a.year ?? null) === (b.year ?? null)

const entryOf = ({ names: _names, ...car }: GarageCar): GarageEntry => car

export async function getGarageCar(): Promise<GarageCar | null> {
  const raw = (await cookies()).get(COOKIE)?.value

  if (!raw) {
    return null
  }

  try {
    const car = JSON.parse(raw) as GarageCar

    return car?.make_id && car.make ? { ...car, names: car.names ?? [] } : null
  } catch {
    return null
  }
}

/** All saved cars, the chosen one first. Shoppers from before the list have only the chosen one. */
export async function listGarage(): Promise<{ active: GarageCar | null; cars: GarageEntry[] }> {
  const active = await getGarageCar()
  const raw = (await cookies()).get(LIST_COOKIE)?.value
  let cars: GarageEntry[] = []

  try {
    const parsed = raw ? JSON.parse(raw) : []

    cars = Array.isArray(parsed)
      ? parsed.filter((car): car is GarageEntry => Boolean(car?.make_id && car.make))
      : []
  } catch {
    cars = []
  }

  if (active && !cars.some((car) => sameCar(car, active))) {
    cars = [entryOf(active), ...cars]
  }

  return { active, cars: cars.slice(0, LIMIT) }
}

async function writeList(cars: GarageEntry[]) {
  ;(await cookies()).set(LIST_COOKIE, JSON.stringify(cars.slice(0, LIMIT)), OPTIONS)
}

async function writeActive(car: GarageCar) {
  // A cookie holds about 4 KB; a long family keeps its first names.
  const value = JSON.stringify({ ...car, names: car.names.slice(0, 25) })

  ;(await cookies()).set(COOKIE, value, OPTIONS)
}

/** Saves the car, makes it the chosen one and puts it first in the garage. */
export async function saveGarageCar(car: GarageCar) {
  const { cars } = await listGarage()

  await writeActive(car)
  await writeList([entryOf(car), ...cars.filter((item) => !sameCar(item, car))])
}

/** Makes a saved car the chosen one. */
export async function chooseGarageCar(entry: GarageEntry) {
  const detail =
    entry.model_key != null
      ? await retrieveVehicleMake(entry.make_id, entry.model_key, entry.year ?? undefined)
      : null

  await saveGarageCar({ ...entry, names: detail?.family?.names ?? [] })
}

/** Removes a car from the garage; removing the chosen one chooses the next. */
export async function removeGarageCar(entry: GarageEntry) {
  const { active, cars } = await listGarage()
  const rest = cars.filter((car) => !sameCar(car, entry))

  await writeList(rest)

  if (active && sameCar(active, entry)) {
    if (rest.length) {
      await chooseGarageCar(rest[0])
    } else {
      ;(await cookies()).delete(COOKIE)
    }
  }
}

/** Removes the chosen car (the × in the header). */
export async function clearGarageCar() {
  const active = await getGarageCar()

  if (active) {
    await removeGarageCar(entryOf(active))
  } else {
    ;(await cookies()).delete(COOKIE)
  }
}
