"use client"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { useParams, usePathname } from "next/navigation"

const ITEMS = [
  { href: "/", label: "Головна" },
  { href: "/store", label: "Каталог" },
  { href: "/vin", label: "Підбір за VIN" },
  { href: "/account/orders", label: "Мої замовлення" },
  { href: "/cart", label: "Кошик" },
]

// Catalog pages live under several addresses; all of them light up "Каталог".
const CATALOG_PATHS = ["/store", "/categories", "/collections", "/products"]

export default function SubNav() {
  const { countryCode } = useParams<{ countryCode: string }>()
  const path = (usePathname() || "/").replace(`/${countryCode}`, "") || "/"

  const isCurrent = (href: string) => {
    if (href === "/") return path === "/"
    if (href === "/store") return CATALOG_PATHS.some((p) => path.startsWith(p))

    return path.startsWith(href)
  }

  return (
    <nav className="ap-subnav" aria-label="Головне меню">
      <div className="ap-subnav-in">
        {ITEMS.map((item) => (
          <LocalizedClientLink
            key={item.href}
            href={item.href}
            className={isCurrent(item.href) ? "ap-current" : undefined}
            data-testid={`nav-${item.href.replace(/\W+/g, "") || "home"}-link`}
          >
            {item.label}
          </LocalizedClientLink>
        ))}
      </div>
    </nav>
  )
}
