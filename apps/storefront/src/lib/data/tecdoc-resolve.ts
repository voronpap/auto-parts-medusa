import { sameMake } from "@lib/util/popular-makes"
import { listTecdocMakes, retrieveTecdocMake } from "./catalog"

/**
 * The cars-page address in the TecDoc tree for a car named the old way: a
 * make name, and model names (a VIN decoder's TecDoc names, or a shop model
 * family label), with the year. One matching model opens it; several open
 * the make with those models first; none opens the make. Null when TecDoc
 * has no such make.
 */
export async function tecdocCarPath({
  make,
  models = [],
  label,
  year,
  vin,
}: {
  make: string
  models?: string[]
  label?: string | null
  year?: number | null
  vin?: string | null
}): Promise<string | null> {
  const found = (await listTecdocMakes()).find((item) => sameMake(item.name, make))

  if (!found) {
    return null
  }

  const detail = await retrieveTecdocMake(found.id)
  const inYear = (from: number | null, to: number | null) =>
    !year || ((from == null || from <= year) && (to == null || to >= year))
  const wanted = new Set(models.map((name) => name.trim().toLowerCase()))
  const prefix = label?.trim().toUpperCase()
  let candidates = (detail?.models ?? []).filter(
    (model) => wanted.has(model.name.toLowerCase()) && inYear(model.year_from, model.year_to)
  )

  // A shop family label ("Golf") matches TecDoc's generations ("GOLF V (1K1)").
  if (!candidates.length && prefix) {
    candidates = (detail?.models ?? []).filter(
      (model) =>
        (model.name === prefix ||
          model.name.startsWith(`${prefix} `) ||
          model.name.startsWith(`${prefix}(`)) &&
        inYear(model.year_from, model.year_to)
    )
  }

  const query = new URLSearchParams()

  if (candidates.length === 1) {
    query.set("model", String(candidates[0].id))
  } else {
    query.set("make", String(found.id))

    if (candidates.length) {
      query.set("pick", candidates.map((model) => model.id).join(","))
    }
  }

  if (year) query.set("year", String(year))
  if (vin) query.set("vin", vin)

  return `/cars?${query}`
}
