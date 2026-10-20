import type { GarageEntry } from "@lib/data/garage"

// Cars picked from the TecDoc tree are kept in the garage with "td:" ids:
// the make id, and as the model key the version (KType) when the engine was
// chosen or "m" and the model id when it was not.
export const TECDOC_PREFIX = "td:"
export const TECDOC_MODEL = "m"

export const isTecdocCar = (car: Pick<GarageEntry, "make_id" | "model_key">) =>
  car.make_id.startsWith(TECDOC_PREFIX) &&
  Boolean(car.model_key?.startsWith(TECDOC_PREFIX))

/** The parts page of a garage car (without the country prefix). */
export function carHref(car: GarageEntry) {
  if (!isTecdocCar(car)) {
    return `/cars?make=${car.make_id}${
      car.model_key ? `&model=${encodeURIComponent(car.model_key)}` : ""
    }${car.year ? `&year=${car.year}` : ""}`
  }

  const key = car.model_key!.slice(TECDOC_PREFIX.length)

  return key.startsWith(TECDOC_MODEL)
    ? `/cars?model=${key.slice(TECDOC_MODEL.length)}${car.year ? `&year=${car.year}` : ""}`
    : `/cars?ktype=${key}`
}
