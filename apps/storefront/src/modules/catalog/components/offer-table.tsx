"use client"

import type { PartOffer } from "@lib/data/parts-catalog"
import { addOfferToCart } from "@lib/data/offers"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

type Props = {
  offers: PartOffer[]
  countryCode: string
}

// Formatted by hand: the server and the browser format currencies
// differently ("грн" / "₴"), which breaks hydration.
const money = (value: number, currency: string) => {
  const [whole, cents] = value.toFixed(2).split(".")
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ")
  const sign = currency.toLowerCase() === "uah" ? "₴" : currency.toUpperCase()

  return `${grouped}${cents === "00" ? "" : `,${cents}`} ${sign}`
}

function availability(offer: PartOffer) {
  if (offer.in_stock) {
    return offer.lead_days ? `В наявності, ${offer.lead_days} дн.` : "В наявності"
  }

  return offer.lead_days ? `Під замовлення, ${offer.lead_days} дн.` : "Під замовлення"
}

function BuyButton({ offer, countryCode }: { offer: PartOffer; countryCode: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [failed, setFailed] = useState(false)

  return (
    <button
      type="button"
      className="ap-add"
      aria-label="Додати в кошик"
      title={failed ? "Не вдалося додати, спробуйте ще раз" : "Додати в кошик"}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            setFailed(false)
            await addOfferToCart(offer.offer_id, countryCode)
            router.refresh()
          } catch {
            setFailed(true)
          }
        })
      }
    >
      {pending ? "…" : failed ? "!" : "+"}
    </button>
  )
}

function Rows({ offers, countryCode }: Props) {
  return (
    <>
      {offers.map((offer) => (
        <tr key={offer.offer_id}>
          <td>
            <strong>{offer.brand}</strong>
            <div className="ap-sku">{offer.number}</div>
          </td>
          <td>
            {offer.product_handle ? (
              <LocalizedClientLink className="ap-link" href={`/products/${offer.product_handle}`}>
                {offer.title || "Запчастина"}
              </LocalizedClientLink>
            ) : (
              offer.title || "Запчастина"
            )}
            {offer.matched && (
              <div className="ap-sku">
                аналог {offer.matched.brand} {offer.matched.number}
              </div>
            )}
          </td>
          <td className={offer.in_stock ? "ap-stock" : "ap-stock ap-none"}>{availability(offer)}</td>
          <td className="ap-price">{money(offer.price, offer.currency_code)}</td>
          <td>
            <BuyButton offer={offer} countryCode={countryCode} />
          </td>
        </tr>
      ))}
    </>
  )
}

/** Offers for a typed number: the part itself first, then its confirmed analogs. */
export default function OfferTable({ offers, countryCode }: Props) {
  const own = offers.filter((offer) => offer.via === "number")
  const analogs = offers.filter((offer) => offer.via === "cross")
  const head = (
    <thead>
      <tr>
        <th>Бренд / номер</th>
        <th>Назва</th>
        <th>Наявність</th>
        <th>Ціна</th>
        <th />
      </tr>
    </thead>
  )

  return (
    <div className="ap-offers">
      {own.length > 0 && (
        <>
          <div className="ap-result-head">Пропозиції за номером</div>
          <div className="ap-table-wrap">
            <table className="ap-table">
              {head}
              <tbody>
                <Rows offers={own} countryCode={countryCode} />
              </tbody>
            </table>
          </div>
        </>
      )}
      {analogs.length > 0 && (
        <>
          <div className="ap-result-head">Аналоги, підтверджені каталогами</div>
          <div className="ap-table-wrap">
            <table className="ap-table">
              {head}
              <tbody>
                <Rows offers={analogs} countryCode={countryCode} />
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
