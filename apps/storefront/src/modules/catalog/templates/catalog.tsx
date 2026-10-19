import { listCategories } from "@lib/data/categories"
import { searchCatalog } from "@lib/data/catalog"
import { listPartOffers, searchByPartNumber } from "@lib/data/parts-catalog"
import CatalogPartTable from "@modules/catalog/components/catalog-part-table"
import OfferTable from "@modules/catalog/components/offer-table"
import { listProducts, listProductsByPrice } from "@lib/data/products"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import ProductTable from "@modules/catalog/components/product-table"

const PAGE_SIZE = 20

const SORTS: { value: SortOptions; label: string }[] = [
  { value: "created_at", label: "Нові" },
  { value: "price_asc", label: "Дешевші" },
  { value: "price_desc", label: "Дорожчі" },
]

type Props = {
  countryCode: string
  title: string
  description?: string | null
  /** Address of this listing without the country prefix, e.g. "/store". */
  basePath: string
  categoryId?: string
  page?: number
  sortBy?: SortOptions
  q?: string
}

export default async function Catalog({
  countryCode,
  title,
  description,
  basePath,
  categoryId,
  page = 1,
  sortBy = "created_at",
  q,
}: Props) {
  const filters = {
    limit: PAGE_SIZE,
    ...(categoryId ? { category_id: [categoryId] } : {}),
    ...(q ? { q } : {}),
  }
  const [categories, { response }] = await Promise.all([
    listCategories().catch(() => []),
    // By date the store pages the list itself; by price the backend orders
    // the whole shop and picks the page.
    sortBy === "created_at"
      ? listProducts({
          pageParam: page,
          countryCode,
          queryParams: { ...filters, order: "-created_at" },
        })
      : listProductsByPrice({
          page,
          order: sortBy === "price_desc" ? "desc" : "asc",
          countryCode,
          queryParams: filters,
        }),
  ])
  // A typed part number also finds products through the parts catalog:
  // the product with that number and the confirmed crosses of that number.
  const [numberMatches, allOffers, catalogFound] =
    q && !categoryId && page === 1
      ? await Promise.all([searchByPartNumber(q), listPartOffers(q), searchCatalog(q)])
      : [[], [], []]
  // One part, one row: several suppliers of the same number show as its best
  // offer (offers come in stock first, then cheapest), and a product that is
  // already offered is not listed again below.
  const seen = new Set<string>()
  const offers = allOffers.filter((offer) => {
    const id = `${offer.brand.toLowerCase()}|${offer.number.replace(/[\s\-.\/\\]+/g, "").toUpperCase()}`

    if (seen.has(id)) {
      return false
    }

    seen.add(id)

    return true
  })
  const offered = new Set(offers.map((offer) => offer.product_handle).filter(Boolean))
  const matches = numberMatches.filter((match) => !offered.has(match.handle))
  const byNumber = matches.length
    ? await listProducts({
        countryCode,
        queryParams: {
          id: matches.map((match) => match.product_id),
          limit: 50,
        },
      })
        .then(({ response }) => response.products)
        .catch(() => [])
    : []
  const order = new Map(matches.map((match, index) => [match.product_id, index]))
  byNumber.sort((a, b) => (order.get(a.id!) ?? 0) - (order.get(b.id!) ?? 0))
  const notes = Object.fromEntries(
    matches.map((match) => [
      match.product_id,
      match.via === "number"
        ? `Номер ${match.matched.brand} ${match.matched.number}`
        : match.via === "prefix"
          ? `Номер ${match.matched.brand} ${match.matched.number} (частковий збіг)`
          : `Аналог номера ${match.matched.brand} ${match.matched.number}`,
    ])
  )
  const listed = response.products.filter(
    (product) => !order.has(product.id!) && !offered.has(product.handle)
  )
  // Makers' catalogue numbers the shop already lists above are not repeated.
  const shown = new Set([
    ...offers.map((offer) => offer.product_handle),
    ...byNumber.map((product) => product.handle),
  ])
  const catalogParts = catalogFound.filter(
    (part) => !part.product || !shown.has(part.product.handle)
  )
  const found =
    catalogParts.length +
    offers.length +
    byNumber.length +
    (response.count - (response.products.length - listed.length))
  const pages = Math.max(1, Math.ceil(response.count / PAGE_SIZE))
  const total = categories.reduce(
    (sum, category) =>
      category.parent_category ? sum : sum + category.product_count,
    0
  )

  const href = (next: { page?: number; sortBy?: SortOptions }) => {
    const params = new URLSearchParams()
    const nextSort = next.sortBy ?? sortBy
    const nextPage = next.page ?? 1

    if (q) params.set("q", q)
    if (nextSort !== "created_at") params.set("sortBy", nextSort)
    if (nextPage > 1) params.set("page", String(nextPage))

    const query = params.toString()

    return query ? `${basePath}?${query}` : basePath
  }

  return (
    <div className="ap-scope ap-page" data-testid="category-container">
      <div className="ap-shell">
        <section className="ap-workspace ap-two">
          <aside className="ap-side ap-card">
            <div className="ap-side-head">Категорії</div>
            <nav className="ap-cats">
              <LocalizedClientLink
                className={categoryId ? undefined : "ap-active"}
                href="/store"
              >
                Усі товари <b>{total}</b>
              </LocalizedClientLink>
              {categories
                .filter((category) => !category.parent_category && category.product_count > 0)
                .map((category) => (
                  <LocalizedClientLink
                    key={category.id}
                    className={
                      category.id === categoryId ? "ap-active" : undefined
                    }
                    href={`/categories/${category.handle}`}
                  >
                    {category.name} <b>{category.product_count}</b>
                  </LocalizedClientLink>
                ))}
            </nav>
          </aside>

          <div className="ap-catalog ap-card">
            <div className="ap-catalog-head">
              <div>
                <h1 data-testid="store-page-title">{title}</h1>
                <p>
                  {q ? `Пошук «${q}» · ` : ""}
                  {found ? `Знайдено: ${found}` : "Нічого не знайдено"}
                  {description ? ` · ${description}` : ""}
                </p>
              </div>
              <div className="ap-tools">
                <form className="ap-filter" action="" method="get">
                  <input
                    type="search"
                    name="q"
                    defaultValue={q}
                    placeholder="Артикул або назва"
                    aria-label="Пошук у каталозі"
                  />
                  {sortBy !== "created_at" && (
                    <input type="hidden" name="sortBy" value={sortBy} />
                  )}
                  <button type="submit">Знайти</button>
                </form>
                <div className="ap-sorts" aria-label="Сортування">
                  {SORTS.map((sort) => (
                    <LocalizedClientLink
                      key={sort.value}
                      className={sort.value === sortBy ? "ap-on" : undefined}
                      href={href({ sortBy: sort.value })}
                    >
                      {sort.label}
                    </LocalizedClientLink>
                  ))}
                </div>
              </div>
            </div>

            {offers.length > 0 && (
              <OfferTable offers={offers} countryCode={countryCode} />
            )}

            {byNumber.length > 0 && (
              <>
                <div className="ap-result-head">За номером деталі</div>
                <ProductTable
                  products={byNumber}
                  countryCode={countryCode}
                  notes={notes}
                />
                {listed.length > 0 && (
                  <div className="ap-result-head">За назвою</div>
                )}
              </>
            )}
            {listed.length ? (
              <ProductTable products={listed} countryCode={countryCode} />
            ) : byNumber.length || offers.length || catalogParts.length ? null : (
              <div className="ap-empty">
                За цим запитом товарів немає.{" "}
                <LocalizedClientLink className="ap-link" href="/cars#request">
                  Не знайшли? Підберемо за VIN
                </LocalizedClientLink>{" "}
                або{" "}
                <LocalizedClientLink className="ap-link" href="/store">
                  покажемо весь каталог
                </LocalizedClientLink>
              </div>
            )}

            {catalogParts.length > 0 && (
              <>
                <div className="ap-result-head">
                  У каталогах виробників · під замовлення
                </div>
                <CatalogPartTable parts={catalogParts} />
              </>
            )}

            {pages > 1 && (
              <nav className="ap-pager" aria-label="Сторінки">
                {page > 1 && (
                  <LocalizedClientLink href={href({ page: page - 1 })}>
                    ← Назад
                  </LocalizedClientLink>
                )}
                <span>
                  Сторінка {page} з {pages}
                </span>
                {page < pages && (
                  <LocalizedClientLink href={href({ page: page + 1 })}>
                    Далі →
                  </LocalizedClientLink>
                )}
              </nav>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
