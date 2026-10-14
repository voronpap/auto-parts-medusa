// Fuel as sources write it -> how a Ukrainian shopper reads it. Checked in
// order, so the more particular wording stands before the general one.
const FUELS: [RegExp, string][] = [
  [/hydrogen|водень/i, "Водень"],
  [/hybrid.*diesel|diesel.*hybrid|гібрид.*дизел/i, "Гібрид (дизель)"],
  [/hybrid|electric-petrol|гібрид/i, "Гібрид (бензин)"],
  [/electric|accumulator|електр/i, "Електро"],
  [/\bcng\b|natural gas|метан/i, "Газ (метан, CNG)"],
  [/\blpg\b|autogas|пропан/i, "Газ (пропан-бутан, LPG)"],
  [/ethanol|methanol|\bbio|біо/i, "Біопаливо"],
  [/diesel|дизел/i, "Дизель"],
  [/petrol|gasoline|бензин/i, "Бензин"],
  [/alternative/i, "Альтернативне паливо"],
]

/**
 * Ukrainian name of a fuel, or null for a value that is not a fuel at all
 * (some catalogues leave placeholders such as "False").
 */
export function fuelName(value: string | null | undefined): string | null {
  const text = value?.trim()

  if (!text) {
    return null
  }

  return FUELS.find(([pattern]) => pattern.test(text))?.[1] ?? null
}
