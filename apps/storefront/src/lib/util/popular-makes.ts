// Makes shoppers look for first; the rest follow alphabetically.
export const POPULAR_MAKES = [
  "Volkswagen", "Skoda", "Audi", "Renault", "Toyota", "Hyundai", "Kia",
  "Nissan", "Ford", "Opel", "Chery", "Geely", "BYD", "Great Wall",
]

export const popularOf = <T extends { name: string }>(makes: T[]): T[] =>
  POPULAR_MAKES.map((name) =>
    makes.find((make) => make.name.toLowerCase() === name.toLowerCase())
  ).filter((make): make is T => Boolean(make))
