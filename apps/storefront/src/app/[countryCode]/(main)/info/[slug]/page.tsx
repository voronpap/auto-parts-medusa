import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { INFO_PAGES } from "@modules/info/pages"
import { Metadata } from "next"
import { notFound } from "next/navigation"

type Props = { params: Promise<{ countryCode: string; slug: string }> }

export async function generateStaticParams() {
  return Object.keys(INFO_PAGES).map((slug) => ({ countryCode: "ua", slug }))
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { countryCode, slug } = await props.params
  const page = INFO_PAGES[slug]

  return page
    ? {
        title: page.title,
        description: page.description,
        alternates: { canonical: `/${countryCode}/info/${slug}` },
      }
    : {}
}

export default async function InfoPage(props: Props) {
  const page = INFO_PAGES[(await props.params).slug]

  if (!page) {
    notFound()
  }

  return (
    <div className="ap-scope ap-page">
      <div className="ap-shell">
        <nav className="ap-crumbs" aria-label="Навігація">
          <LocalizedClientLink href="/">Головна</LocalizedClientLink> /{" "}
          <b>{page.title}</b>
        </nav>
        <article className="ap-section ap-card ap-info">
          <h1 className="ap-pdp-title">{page.title}</h1>
          {page.body}
        </article>
      </div>
    </div>
  )
}
