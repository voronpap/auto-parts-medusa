// Makes shoppers look for first; the rest follow alphabetically.
export const POPULAR_MAKES = [
  "Volkswagen", "Skoda", "Audi", "Renault", "Toyota", "Hyundai", "Kia",
  "Nissan", "Ford", "Opel", "Chery", "Geely", "BYD", "Great Wall",
]

// Other spellings of the same makes (TecDoc writes Volkswagen as "VW").
const ALIASES: Record<string, string[]> = {
  volkswagen: ["vw"],
  "great wall": ["great wall motors", "gwm"],
}

export const popularOf = <T extends { name: string }>(makes: T[]): T[] =>
  POPULAR_MAKES.map((name) => {
    const names = [name.toLowerCase(), ...(ALIASES[name.toLowerCase()] ?? [])]

    return makes.find((make) => names.includes(make.name.toLowerCase()))
  }).filter((make): make is T => Boolean(make))

/** Whether two spellings name the same make ("Volkswagen" and "VW"). */
export function sameMake(a: string, b: string) {
  const names = (name: string) => {
    const key = name.trim().toLowerCase()
    const alias = Object.entries(ALIASES).find(
      ([full, others]) => full === key || others.includes(key)
    )

    return alias ? [alias[0], ...alias[1]] : [key]
  }

  return names(a).includes(b.trim().toLowerCase())
}
