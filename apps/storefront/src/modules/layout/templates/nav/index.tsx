import { Suspense } from "react"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import CartButton from "@modules/layout/components/cart-button"
import Search from "@modules/layout/components/search"
import SubNav from "@modules/layout/components/sub-nav"

export default async function Nav() {
  return (
    <header className="ap-scope ap-top relative z-50">
      <div className="ap-top-in">
        <LocalizedClientLink
          href="/"
          className="ap-brand"
          aria-label="Auto Parts — головна"
          data-testid="nav-store-link"
        >
          <span className="ap-brand-mark">AP</span>
          <span>
            AUTO <em>PARTS</em>
          </span>
        </LocalizedClientLink>

        <div className="ap-search">
          <Search />
        </div>

        <div className="ap-account">
          <LocalizedClientLink href="/account" data-testid="nav-account-link">
            Кабінет
          </LocalizedClientLink>
          <div className="ap-basket">
            <Suspense
              fallback={
                <LocalizedClientLink
                  className="flex h-full items-center"
                  href="/cart"
                  data-testid="nav-cart-link"
                >
                  Кошик · 0
                </LocalizedClientLink>
              }
            >
              <CartButton />
            </Suspense>
          </div>
        </div>
      </div>

      <SubNav />
    </header>
  )
}
