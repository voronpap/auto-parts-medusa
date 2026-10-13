import { retrieveCart } from "@lib/data/cart"
import { retrieveCustomer } from "@lib/data/customer"
import PaymentWrapper from "@modules/checkout/components/payment-wrapper"
import CheckoutForm from "@modules/checkout/templates/checkout-form"
import CheckoutSummary from "@modules/checkout/templates/checkout-summary"
import { Metadata } from "next"
import { notFound } from "next/navigation"

export const metadata: Metadata = {
  title: "Оформлення замовлення",
}

export default async function Checkout() {
  const cart = await retrieveCart()

  if (!cart) {
    return notFound()
  }

  const customer = await retrieveCustomer()

  return (
    <div className="ap-scope ap-page">
      <div className="ap-shell grid grid-cols-1 small:grid-cols-[1fr_416px] gap-4 items-start">
        <div className="ap-card p-6 small:p-8">
          <PaymentWrapper cart={cart}>
            <CheckoutForm cart={cart} customer={customer} />
          </PaymentWrapper>
        </div>
        <div className="ap-card p-6 small:sticky small:top-4">
          <CheckoutSummary cart={cart} />
        </div>
      </div>
    </div>
  )
}
