import { listCategories } from "@lib/data/categories"
import { searchByPartNumber } from "@lib/data/parts-catalog"
import { listProducts, listProductsWithSort } from "@lib/data/products"
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
    // By date the store pages the list itself, however long it is. By price
    // the helper sorts in memory and sees the first hundred matches only.
    sortBy === "created_at"
      ? listProducts({
          pageParam: page,
          countryCode,
          queryParams: { ...filters, order: "-created_at" },
        })
      : listProductsWithSort({ page, sortBy, countryCode, queryParams: filters }),
  ])
  // A typed part number also finds products through the parts catalog:
  // the product with that number and the confirmed crosses of that number.
  const matches = q && !categoryId && page === 1 ? await searchByPartNumber(q) : []
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
        : `Аналог номера ${match.matched.brand} ${match.matched.number}`,
    ])
  )
  const listed = response.products.filter((product) => !order.has(product.id!))
  const found = byNumber.length + (response.count - (response.products.length - listed.length))
  const pages = Math.max(1, Math.ceil(response.count / PAGE_SIZE))
  const total = categories.reduce(
    (sum, category) =>
      category.parent_category ? sum : sum + (category.products?.length ?? 0),
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
                .filter((category) => !category.parent_category)
                .map((category) => (
                  <LocalizedClientLink
                    key={category.id}
                    className={
                      category.id === categoryId ? "ap-active" : undefined
                    }
                    href={`/categories/${category.handle}`}
                  >
                    {category.name} <b>{category.products?.length ?? 0}</b>
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
            ) : byNumber.length ? null : (
              <div className="ap-empty">
                За цим запитом товарів немає.{" "}
                <LocalizedClientLink className="ap-link" href="/store">
                  Показати весь каталог
                </LocalizedClientLink>
              </div>
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
