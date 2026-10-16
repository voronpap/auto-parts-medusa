import { Suspense } from "react"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import CartButton from "@modules/layout/components/cart-button"
import HeaderSearch from "@modules/layout/components/header-search"
import GarageChip from "@modules/garage/garage-chip"
import SubNav from "@modules/layout/components/sub-nav"
import User from "@modules/common/icons/user"

export default async function Nav() {
  return (
    <header className="ap-scope ap-top relative z-50">
      <a href="#main" className="ap-skip">
        Перейти до вмісту
      </a>
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

        <Suspense fallback={<div className="ap-search" />}>
          <HeaderSearch />
        </Suspense>

        <div className="ap-account">
          <Suspense fallback={null}>
            <GarageChip />
          </Suspense>
          <LocalizedClientLink
            href="/account"
            className="ap-account-link"
            data-testid="nav-account-link"
          >
            <User size="18" aria-hidden="true" />
            <span>Кабінет</span>
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
