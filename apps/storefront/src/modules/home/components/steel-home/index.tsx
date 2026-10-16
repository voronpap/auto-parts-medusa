import { CategoryWithCount } from "@lib/data/categories"
import { plural } from "@lib/util/plural"
import { HttpTypes } from "@medusajs/types"
import AddButton from "@modules/catalog/components/add-button"
import {
  PartIcon,
  isAvailable,
  money,
} from "@modules/catalog/components/product-table"
import PartImage from "@modules/catalog/components/part-image"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

type Props = {
  countryCode: string
  products: HttpTypes.StoreProduct[]
  count: number
  categories: CategoryWithCount[]
}

const BRANDS = [
  "Bosch",
  "KYB",
  "Monroe",
  "SKF",
  "Sachs",
  "Gates",
  "MANN-FILTER",
  "FEBEST",
]

export default function SteelHome({
  countryCode,
  products,
  count,
  categories,
}: Props) {
  const topCategories = categories.filter(
    (category) => !category.parent_category && category.product_count > 0
  )
  // One product from each of the largest categories, picked by the page.
  const popular = products

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
                placeholder="Номер деталі, VIN або назва, наприклад W 712/95"
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
              <LocalizedClientLink href="/cars">
                підбір за авто →
              </LocalizedClientLink>
            </div>
          </div>
          <div className="ap-hero-visual" aria-hidden="true">
            <div className="ap-ring" />
            <span className="ap-visual-tag">
              {count
                ? `${plural(count, ["товар", "товари", "товарів"])} у каталозі`
                : "Auto Parts"}
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
            <strong>Підбір за авто та VIN</strong>
            <span>деталі саме для вашої машини</span>
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
              {topCategories.slice(0, 12).map((category) => (
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
                    <small>Товарів: {category.product_count}</small>
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
                      <PartImage
                        src={product.thumbnail || product.images?.[0]?.url}
                        title={product.title}
                        size={240}
                        sizes="(max-width: 640px) 50vw, 240px"
                      />
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
                Введіть номер виробника або назву в пошуку чи відкрийте потрібну
                категорію.
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
                Нова пошта, Укрпошта або самовивіз — вкажіть зручний спосіб під
                час замовлення.
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
