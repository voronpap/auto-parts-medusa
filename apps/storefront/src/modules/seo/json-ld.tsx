import { SHOP } from "@lib/shop-info"
import { getBaseURL } from "@lib/util/env"

/** Structured data for search engines; "<" is escaped so text cannot close the tag. */
export const JsonLd = ({ data }: { data: Record<string, unknown> }) => (
  <script
    type="application/ld+json"
    dangerouslySetInnerHTML={{
      __html: JSON.stringify(data).replace(/</g, "\u003c"),
    }}
  />
)

export const absoluteUrl = (path: string) =>
  new URL(path, getBaseURL()).toString()

/** Crumbs as [name, path]; the last one is the page itself. */
export const breadcrumbList = (items: [string, string][]) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map(([name, path], index) => ({
    "@type": "ListItem",
    position: index + 1,
    name,
    item: absoluteUrl(path),
  })),
})

/** The shop as an Organization; contacts appear once they are filled in. */
export const organization = () => ({
  "@type": "Organization",
  "@id": absoluteUrl("/#organization"),
  name: SHOP.name,
  url: absoluteUrl("/"),
  ...(SHOP.phone ? { telephone: SHOP.phone } : {}),
  ...(SHOP.email ? { email: SHOP.email } : {}),
})
