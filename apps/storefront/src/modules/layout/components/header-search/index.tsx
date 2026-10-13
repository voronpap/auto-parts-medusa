"use client"

import { useParams, useSearchParams } from "next/navigation"

/**
 * Search in the header. It opens the catalog, which looks a query up by title
 * and, for part numbers, through the parts catalog and its crosses.
 */
export default function HeaderSearch() {
  const { countryCode } = useParams<{ countryCode: string }>()
  const current = useSearchParams().get("q") ?? ""

  return (
    <form
      className="ap-search"
      action={`/${countryCode}/store`}
      method="get"
      role="search"
    >
      <input
        key={current}
        type="search"
        name="q"
        defaultValue={current}
        placeholder="Номер деталі, OE-номер або назва…"
        aria-label="Пошук запчастин"
        data-testid="nav-search-input"
      />
      <button type="submit" aria-label="Знайти" data-testid="nav-search-button">
        <svg
          width="19"
          height="19"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.3"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4-4" />
        </svg>
      </button>
    </form>
  )
}
