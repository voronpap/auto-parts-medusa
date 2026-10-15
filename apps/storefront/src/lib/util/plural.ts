const rules = new Intl.PluralRules("uk")

/** "23 товари", "5 товарів", "1 товар": forms are [one, few, many]. */
export const plural = (
  count: number,
  [one, few, many]: [string, string, string]
) => {
  const form = rules.select(count)

  return `${count} ${form === "one" ? one : form === "few" ? few : many}`
}
