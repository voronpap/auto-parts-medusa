import { HttpTypes } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import AddButton from "./add-button"

type Props = {
  countryCode: string
  products: HttpTypes.StoreProduct[]
  count: number
  categories: HttpTypes.StoreProductCategory[]
  cart: HttpTypes.StoreCart | null
}

const money = (amount: number | null | undefined) =>
  `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(
    amount ?? 0
  )} ₴`

const PartIcon = ({ title }: { title: string }) => {
  const name = title.toLowerCase()

  if (name.includes("фільтр")) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M8 3h8v5l2 3v10H6V11l2-3z" />
        <path d="M8 8h8M9 13h6M9 17h6" />
      </svg>
    )
  }

  if (name.includes("амортизатор")) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M7 3v4l3 2-3 2 3 2-3 2 3 2-3 2v2M17 3v18" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <path d="m12 4 2 5m6 3-5 2m-3 6-2-5m-6-3 5-2" />
    </svg>
  )
}

const Stock = ({ variant }: { variant?: HttpTypes.StoreProductVariant }) => {
  const quantity = variant?.inventory_quantity ?? 0
  const available =
    Boolean(variant) &&
    (!variant!.manage_inventory || variant!.allow_backorder || quantity > 0)

  if (!available) {
    return <span className="ap-stock ap-none">Немає в наявності</span>
  }

  return (
    <span className="ap-stock">
      ● {variant!.manage_inventory && quantity > 0 ? `${quantity} шт. на складі` : "В наявності"}
    </span>
  )
}

export default function SteelHome({
  countryCode,
  products,
  count,
  categories,
  cart,
}: Props) {
  const items = cart?.items ?? []

  return (
    <div className="ap-scope ap-page">
      <div className="ap-shell">
        <section className="ap-intro">
          <div className="ap-intro-copy">
            <div className="ap-eyebrow">Auto Parts · каталог запчастин</div>
            <h1 className="ap-h1">Деталі без зайвих зупинок</h1>
            <p className="ap-lead">
              Запчастини для СТО, магазинів та автомобілістів: пошук за
              артикулом і назвою, наявність і замовлення в одному екрані.
            </p>
            <div className="ap-intro-actions">
              <LocalizedClientLink className="ap-primary" href="/store">
                Відкрити каталог →
              </LocalizedClientLink>
              <LocalizedClientLink className="ap-secondary" href="/account">
                Особистий кабінет
              </LocalizedClientLink>
            </div>
          </div>
          <div className="ap-intro-visual" aria-hidden="true">
            <div className="ap-ring" />
            <span className="ap-visual-tag">Auto Parts / UA</span>
          </div>
        </section>

        <section className="ap-stats" aria-label="Переваги">
          <div className="ap-stat">
            <strong>Пошук за артикулом</strong>
            <span>номер деталі або назва</span>
          </div>
          <div className="ap-stat">
            <strong>Відомі бренди</strong>
            <span>Bosch, MANN-FILTER, KYB, Monroe</span>
          </div>
          <div className="ap-stat">
            <strong>Дані виробників</strong>
            <span>аналоги й застосовність з каталогів</span>
          </div>
          <div className="ap-stat">
            <strong>Доставка по Україні</strong>
            <span>Нова пошта, Укрпошта, самовивіз</span>
          </div>
        </section>

        <section className="ap-workspace" id="catalog">
          <aside className="ap-side ap-card">
            <div className="ap-side-head">Категорії</div>
            <nav className="ap-cats">
              <LocalizedClientLink className="ap-active" href="/store">
                Усі товари <b>{count}</b>
              </LocalizedClientLink>
              {categories
                .filter((category) => !category.parent_category)
                .map((category) => (
                  <LocalizedClientLink
                    key={category.id}
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
                <h2>Каталог</h2>
                <p>
                  {count
                    ? `Показано ${products.length} з ${count}`
                    : "Товари ще не додано"}
                </p>
              </div>
              <LocalizedClientLink className="ap-all" href="/store">
                Увесь каталог →
              </LocalizedClientLink>
            </div>
            {products.length ? (
              <table className="ap-table">
                <thead>
                  <tr>
                    <th>Товар</th>
                    <th>Наявність</th>
                    <th>Ціна</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => {
                    const variant = product.variants?.[0]
                    const price = variant?.calculated_price?.calculated_amount
                    const quantity = variant?.inventory_quantity ?? 0
                    const canOrder =
                      Boolean(variant) &&
                      price != null &&
                      (!variant!.manage_inventory ||
                        variant!.allow_backorder ||
                        quantity > 0)

                    return (
                      <tr key={product.id}>
                        <td>
                          <LocalizedClientLink
                            className="ap-part"
                            href={`/products/${product.handle}`}
                          >
                            <span className="ap-part-img">
                              {product.thumbnail ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={product.thumbnail} alt="" />
                              ) : (
                                <PartIcon title={product.title} />
                              )}
                            </span>
                            <span>
                              <strong>{product.title}</strong>
                              <small>
                                {product.subtitle || variant?.sku || ""}
                              </small>
                            </span>
                          </LocalizedClientLink>
                        </td>
                        <td>
                          <Stock variant={variant} />
                        </td>
                        <td>
                          <span className="ap-price">
                            {price != null ? money(price) : "—"}
                          </span>
                        </td>
                        <td>
                          <AddButton
                            variantId={variant?.id}
                            countryCode={countryCode}
                            disabled={!canOrder}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : (
              <div className="ap-empty">Каталог наповнюється.</div>
            )}
          </div>

          <aside className="ap-order ap-card">
            <div className="ap-order-top">
              <strong>Ваше замовлення</strong>
              <span>
                {items.length
                  ? `Позицій: ${items.length}`
                  : "Кошик порожній"}
              </span>
            </div>
            {items.length ? (
              <>
                <div className="ap-order-list">
                  {items.map((item) => (
                    <div className="ap-order-row" key={item.id}>
                      <span>
                        {item.product_title ?? item.title}
                        <small>
                          {item.quantity} × {money(item.unit_price)}
                        </small>
                      </span>
                      <b>{money(item.total)}</b>
                    </div>
                  ))}
                </div>
                <div className="ap-total">
                  <span>Разом</span>
                  <strong>{money(cart?.total)}</strong>
                </div>
                <LocalizedClientLink className="ap-primary" href="/cart">
                  Оформити замовлення
                </LocalizedClientLink>
              </>
            ) : (
              <div className="ap-note">
                Додайте товар кнопкою «+» у каталозі — він з&apos;явиться тут.
              </div>
            )}
          </aside>
        </section>
      </div>
    </div>
  )
}
