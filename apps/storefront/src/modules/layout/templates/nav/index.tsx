import { Suspense } from "react"

import { listCategories } from "@lib/data/categories"
import { listLocales } from "@lib/data/locales"
import { getLocale } from "@lib/data/locale-actions"
import { listRegions } from "@lib/data/regions"
import { StoreRegion } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import CartButton from "@modules/layout/components/cart-button"
import Search from "@modules/layout/components/search"
import SideMenu from "@modules/layout/components/side-menu"

export default async function Nav() {
  const [regions, locales, currentLocale, categories] = await Promise.all([
    listRegions().then((regions: StoreRegion[]) => regions),
    listLocales(),
    getLocale(),
    listCategories().catch(() => []),
  ])

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

      <nav className="ap-subnav">
        <div className="ap-subnav-in">
          <div className="h-[43px]">
            <SideMenu
              regions={regions}
              locales={locales}
              currentLocale={currentLocale}
            />
          </div>
          <LocalizedClientLink className="ap-current" href="/store">
            Каталог
          </LocalizedClientLink>
          {categories
            .filter((category) => !category.parent_category)
            .slice(0, 6)
            .map((category) => (
              <LocalizedClientLink
                key={category.id}
                href={`/categories/${category.handle}`}
              >
                {category.name}
              </LocalizedClientLink>
            ))}
          <LocalizedClientLink href="/account/orders">
            Мої замовлення
          </LocalizedClientLink>
        </div>
      </nav>
    </header>
  )
}
