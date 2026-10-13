import { HttpTypes } from "@medusajs/types"
import AddButton from "@modules/catalog/components/add-button"
import { PartIcon, isAvailable, money } from "@modules/catalog/components/product-table"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

type Props = {
  countryCode: string
  products: HttpTypes.StoreProduct[]
  count: number
  categories: HttpTypes.StoreProductCategory[]
}

const POPULAR = 8
const BRANDS = ["Bosch", "MANN-FILTER", "FILTRON", "febi", "KYB", "Monroe"]

/** A few products from every category, so the showcase is not one shelf. */
const pickPopular = (
  products: HttpTypes.StoreProduct[],
  categories: HttpTypes.StoreProductCategory[]
) => {
  const byId = new Map(products.map((product) => [product.id, product]))
  const shelves = categories
    .map((category) =>
      (category.products ?? [])
        .map((product) => byId.get(product.id))
        .filter((product): product is HttpTypes.StoreProduct => Boolean(product))
    )
    .filter((shelf) => shelf.length)
  const picked: HttpTypes.StoreProduct[] = []

  for (let round = 0; picked.length < POPULAR; round++) {
    const row = shelves
      .map((shelf) => shelf[round])
      .filter((product) => product && !picked.includes(product))

    if (!row.length) {
      break
    }

    picked.push(...row)
  }

  for (const product of products) {
    if (picked.length >= POPULAR) {
      break
    }

    if (!picked.includes(product)) {
      picked.push(product)
    }
  }

  return picked.slice(0, POPULAR)
}

export default function SteelHome({
  countryCode,
  products,
  count,
  categories,
}: Props) {
  const topCategories = categories.filter(
    (category) => !category.parent_category
  )
  const popular = pickPopular(products, topCategories)

  return (
    <div className="ap-scope ap-page">
      <div className="ap-shell">
        <section className="ap-hero">
          <div className="ap-hero-copy">
            <div className="ap-eyebrow">Інтернет-магазин автозапчастин</div>
            <h1 className="ap-h1">Деталі без зайвих зупинок</h1>
            <p className="ap-lead">
              Гальмівна система, фільтри, підвіска від перевірених виробників.
              Знайдіть потрібну деталь за номером або назвою — і замовте з
              доставкою по Україні.
            </p>
            <form
              className="ap-hero-search"
              action={`/${countryCode}/store`}
              method="get"
            >
              <input
                type="search"
                name="q"
                placeholder="Номер деталі або назва, наприклад W 712/95"
                aria-label="Пошук запчастини"
              />
              <button type="submit">Знайти</button>
            </form>
            <div className="ap-hero-hints">
              <span>Шукають:</span>
              <LocalizedClientLink href="/store?q=масляний фільтр">
                масляний фільтр
              </LocalizedClientLink>
              <LocalizedClientLink href="/store?q=колодки">
                гальмівні колодки
              </LocalizedClientLink>
              <LocalizedClientLink href="/store?q=амортизатор">
                амортизатор
              </LocalizedClientLink>
            </div>
          </div>
          <div className="ap-hero-visual" aria-hidden="true">
            <div className="ap-ring" />
            <span className="ap-visual-tag">
              {count ? `${count} товарів у каталозі` : "Auto Parts"}
            </span>
          </div>
        </section>

        <section className="ap-perks" aria-label="Переваги">
          <div className="ap-perk">
            <strong>Пошук за артикулом</strong>
            <span>номер виробника або назва деталі</span>
          </div>
          <div className="ap-perk">
            <strong>Відомі бренди</strong>
            <span>Bosch, MANN-FILTER, KYB, Monroe та інші</span>
          </div>
          <div className="ap-perk">
            <strong>Доставка по Україні</strong>
            <span>Нова пошта, Укрпошта, самовивіз</span>
          </div>
          <div className="ap-perk">
            <strong>Для СТО та магазинів</strong>
            <span>кабінет з історією замовлень</span>
          </div>
        </section>

        {topCategories.length > 0 && (
          <section className="ap-block">
            <div className="ap-block-head">
              <h2>Категорії</h2>
              <LocalizedClientLink href="/store">
                Увесь каталог →
              </LocalizedClientLink>
            </div>
            <div className="ap-tiles">
              {topCategories.map((category) => (
                <LocalizedClientLink
                  key={category.id}
                  className="ap-tile"
                  href={`/categories/${category.handle}`}
                >
                  <span className="ap-tile-icon">
                    <PartIcon title={category.name} />
                  </span>
                  <span>
                    <strong>{category.name}</strong>
                    <small>Товарів: {category.products?.length ?? 0}</small>
                  </span>
                  <i aria-hidden="true">→</i>
                </LocalizedClientLink>
              ))}
            </div>
          </section>
        )}

        {popular.length > 0 && (
          <section className="ap-block">
            <div className="ap-block-head">
              <h2>Популярні товари</h2>
              <LocalizedClientLink href="/store">
                Дивитися всі →
              </LocalizedClientLink>
            </div>
            <div className="ap-grid">
              {popular.map((product) => {
                const variant = product.variants?.[0]
                const price = variant?.calculated_price?.calculated_amount
                const available = isAvailable(variant)

                return (
                  <article className="ap-product" key={product.id}>
                    <LocalizedClientLink
                      className="ap-product-img"
                      href={`/products/${product.handle}`}
                      aria-label={product.title}
                    >
                      {product.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={product.thumbnail} alt="" />
                      ) : (
                        <PartIcon title={product.title} />
                      )}
                    </LocalizedClientLink>
                    <small className="ap-product-sku">
                      {product.subtitle || variant?.sku || ""}
                    </small>
                    <LocalizedClientLink
                      className="ap-product-title"
                      href={`/products/${product.handle}`}
                    >
                      {product.title}
                    </LocalizedClientLink>
                    <span
                      className={available ? "ap-stock" : "ap-stock ap-none"}
                    >
                      {available ? "● В наявності" : "Немає в наявності"}
                    </span>
                    <div className="ap-product-foot">
                      <span className="ap-price">
                        {price != null ? money(price) : "—"}
                      </span>
                      <AddButton
                        variantId={variant?.id}
                        countryCode={countryCode}
                        disabled={!available || price == null}
                      />
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        )}

        <section className="ap-block">
          <div className="ap-block-head">
            <h2>Бренди</h2>
          </div>
          <div className="ap-brands">
            {BRANDS.map((brand) => (
              <LocalizedClientLink key={brand} href={`/store?q=${brand}`}>
                {brand}
              </LocalizedClientLink>
            ))}
          </div>
        </section>

        <section className="ap-block">
          <div className="ap-block-head">
            <h2>Як замовити</h2>
          </div>
          <ol className="ap-steps">
            <li>
              <b>1</b>
              <strong>Знайдіть деталь</strong>
              <span>
                Введіть номер виробника або назву в пошуку чи відкрийте
                потрібну категорію.
              </span>
            </li>
            <li>
              <b>2</b>
              <strong>Додайте в кошик</strong>
              <span>
                Перевірте наявність і ціну, додайте товар і перейдіть до
                оформлення.
              </span>
            </li>
            <li>
              <b>3</b>
              <strong>Оберіть доставку</strong>
              <span>
                Нова пошта, Укрпошта або самовивіз — вкажіть зручний спосіб
                під час замовлення.
              </span>
            </li>
          </ol>
        </section>

        <section className="ap-cta">
          <div>
            <h2>Працюєте на СТО чи в магазині?</h2>
            <p>
              Зареєструйтеся — адреси доставки та історія замовлень
              зберігатимуться в кабінеті, а повторне замовлення займе хвилину.
            </p>
          </div>
          <div className="ap-cta-actions">
            <LocalizedClientLink className="ap-primary" href="/account">
              Створити кабінет
            </LocalizedClientLink>
            <LocalizedClientLink className="ap-ghost" href="/store">
              До каталогу
            </LocalizedClientLink>
          </div>
        </section>
      </div>
    </div>
  )
}
