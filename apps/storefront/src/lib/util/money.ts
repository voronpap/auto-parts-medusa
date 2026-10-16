import { isEmpty } from "./isEmpty"

type ConvertToLocaleParams = {
  amount: number
  currency_code: string
  minimumFractionDigits?: number
  maximumFractionDigits?: number
  locale?: string
}

export const convertToLocale = ({
  amount,
  currency_code,
  minimumFractionDigits,
  maximumFractionDigits,
  locale = "uk-UA",
}: ConvertToLocaleParams) => {
  // Hryvnia is formatted by hand: Node prints "грн", the browser "₴",
  // and the mismatch breaks hydration of every price (React #418).
  if (currency_code?.toLowerCase() === "uah") {
    const digits = maximumFractionDigits ?? 2
    const [whole, cents] = amount.toFixed(digits).split(".")
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ")
    const dropCents = !cents || (minimumFractionDigits === 0 && /^0+$/.test(cents))

    return `${grouped}${dropCents ? "" : `,${cents}`} ₴`
  }

  return currency_code && !isEmpty(currency_code)
    ? new Intl.NumberFormat(locale, {
        style: "currency",
        currency: currency_code,
        minimumFractionDigits,
        maximumFractionDigits,
      }).format(amount)
    : amount.toString()
}
