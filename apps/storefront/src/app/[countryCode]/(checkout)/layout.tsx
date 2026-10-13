import LocalizedClientLink from "@modules/common/components/localized-client-link"

export default function CheckoutLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="w-full relative small:min-h-screen">
      <header className="ap-scope ap-top">
        <div className="ap-top-in ap-top-checkout">
          <LocalizedClientLink
            href="/"
            className="ap-brand"
            aria-label="Auto Parts — головна"
            data-testid="store-link"
          >
            <span className="ap-brand-mark">AP</span>
            <span>
              AUTO <em>PARTS</em>
            </span>
          </LocalizedClientLink>
          <strong className="ap-checkout-title">Оформлення замовлення</strong>
          <LocalizedClientLink
            href="/cart"
            className="ap-back"
            data-testid="back-to-cart-link"
          >
            ← Назад до кошика
          </LocalizedClientLink>
        </div>
      </header>
      <div className="relative" data-testid="checkout-container">
        {children}
      </div>
    </div>
  )
}
