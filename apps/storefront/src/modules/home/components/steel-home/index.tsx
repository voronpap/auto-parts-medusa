import { HttpTypes } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import ProductTable, { money } from "@modules/catalog/components/product-table"

type Props = {
  countryCode: string
  products: HttpTypes.StoreProduct[]
  count: number
  categories: HttpTypes.StoreProductCategory[]
  cart: HttpTypes.StoreCart | null
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
              <ProductTable products={products} countryCode={countryCode} />
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
