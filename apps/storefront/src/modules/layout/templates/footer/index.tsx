import { listCategories } from "@lib/data/categories"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

export default async function Footer() {
  const categories = await listCategories().catch(() => [])

  return (
    <footer className="ap-scope ap-footer">
      <div className="ap-footer-in">
        <div>
          <LocalizedClientLink href="/" className="ap-brand">
            <span className="ap-brand-mark">AP</span>
            <span>
              AUTO <em>PARTS</em>
            </span>
          </LocalizedClientLink>
          <p>Автозапчастини для СТО, магазинів та автомобілістів.</p>
        </div>
        <nav aria-label="Категорії" data-testid="footer-categories">
          <strong>Категорії</strong>
          {categories
            .filter((category) => !category.parent_category && category.product_count > 0)
            .slice(0, 6)
            .map((category) => (
              <LocalizedClientLink
                key={category.id}
                href={`/categories/${category.handle}`}
              >
                {category.name}
              </LocalizedClientLink>
            ))}
        </nav>
        <nav aria-label="Покупцям">
          <strong>Покупцям</strong>
          <LocalizedClientLink href="/store">Каталог</LocalizedClientLink>
          <LocalizedClientLink href="/cart">Кошик</LocalizedClientLink>
          <LocalizedClientLink href="/account">Кабінет</LocalizedClientLink>
          <LocalizedClientLink href="/account/orders">
            Мої замовлення
          </LocalizedClientLink>
        </nav>
      </div>
      <div className="ap-footer-copy">
        © {new Date().getFullYear()} Auto Parts. Усі права захищено.
      </div>
    </footer>
  )
}
