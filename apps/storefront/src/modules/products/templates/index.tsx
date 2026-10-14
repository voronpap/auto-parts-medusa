import React, { Suspense } from "react"

import { getGarageCar } from "@lib/data/garage"
import { PartsCatalogInfo, retrievePartsCatalog } from "@lib/data/parts-catalog"
import FitBadge from "@modules/garage/fit-badge"
import { HttpTypes } from "@medusajs/types"
import { PartIcon } from "@modules/catalog/components/product-table"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import ProductActions from "@modules/products/components/product-actions"
import RelatedProducts from "@modules/products/components/related-products"
import SkeletonRelatedProducts from "@modules/skeletons/templates/skeleton-related-products"
import { notFound } from "next/navigation"

import ProductActionsWrapper from "./product-actions-wrapper"

type ProductTemplateProps = {
  product: HttpTypes.StoreProduct
  region: HttpTypes.StoreRegion
  countryCode: string
  images: HttpTypes.StoreProductImage[]
}

type Cross = PartsCatalogInfo["crosses"][number]

const years = (from: number | null, to: number | null) => {
  if (from && to) return from === to ? `${from}` : `${from}–${to}`
  if (from) return `з ${from}`
  if (to) return `до ${to}`

  return "—"
}

const CrossTable = ({ title, hint, items }: { title: string; hint?: string; items: Cross[] }) => {
  if (!items.length) {
    return null
  }

  // One row per maker keeps long lists readable.
  const byBrand = new Map<string, Cross[]>()

  for (const item of items) {
    byBrand.set(item.brand, [...(byBrand.get(item.brand) ?? []), item])
  }

  return (
    <div className="ap-cross-group">
      <h3>
        {title} <b>{items.length}</b>
      </h3>
      {hint && <p className="ap-hint">{hint}</p>}
      <table className="ap-table ap-facts">
        <tbody>
          {Array.from(byBrand.entries()).map(([brand, numbers]) => (
            <tr key={brand}>
              <th>{brand}</th>
              <td>
                <div className="ap-numbers">
                  {numbers.map((cross) =>
                    cross.product ? (
                      <LocalizedClientLink
                        key={cross.number}
                        className="ap-number ap-in-store"
                        href={`/products/${cross.product.handle}`}
                        title={`${cross.product.title} — є в каталозі`}
                      >
                        {cross.number}
                      </LocalizedClientLink>
                    ) : (
                      <span
                        key={cross.number}
                        className="ap-number"
                        title={cross.conditional ? "За умов, указаних виробником" : undefined}
                      >
                        {cross.number}
                        {cross.conditional ? " *" : ""}
                      </span>
                    )
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const ProductTemplate = async ({
  product,
  region,
  countryCode,
  images,
}: ProductTemplateProps) => {
  if (!product || !product.id) {
    return notFound()
  }

  const [catalog, garage] = await Promise.all([retrievePartsCatalog(product.id), getGarageCar()])
  const number = catalog.numbers[0]
  const image = images[0]?.url || product.thumbnail
  const inStore = catalog.crosses.filter((cross) => cross.product)
  const replacements = catalog.crosses.filter((cross) => cross.kind === "replacement")
  const oem = catalog.crosses.filter((cross) => cross.kind === "oem")
  const aftermarket = catalog.crosses.filter(
    (cross) => cross.kind === "aftermarket" || cross.kind === "replaces"
  )
  const modelCount = catalog.fitment.reduce((sum, make) => sum + make.models.length, 0)
  const hasConditional =
    catalog.crosses.some((cross) => cross.conditional) ||
    catalog.fitment.some((make) => make.models.some((model) => model.conditional))

  return (
    <div className="ap-scope ap-page" data-testid="product-container">
      <div className="ap-shell">
        <nav className="ap-crumbs" aria-label="Навігація">
          <LocalizedClientLink href="/">Головна</LocalizedClientLink>
          <span>/</span>
          <LocalizedClientLink href="/store">Каталог</LocalizedClientLink>
          <span>/</span>
          <b>{product.title}</b>
        </nav>

        <section className="ap-pdp ap-card">
          <div className="ap-pdp-img">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt={product.title} />
            ) : (
              <PartIcon title={product.title} />
            )}
          </div>
          <div className="ap-pdp-info">
            <div className="ap-eyebrow">
              {number ? `${number.brand} · ${number.number}` : product.subtitle}
            </div>
            <h1 className="ap-pdp-title" data-testid="product-title">
              {product.title}
            </h1>
            {product.description && (
              <p className="ap-lead" data-testid="product-description">
                {product.description}
              </p>
            )}
            <dl className="ap-keyfacts">
              {number && (
                <>
                  <div>
                    <dt>Виробник</dt>
                    <dd>{number.brand}</dd>
                  </div>
                  <div>
                    <dt>Артикул</dt>
                    <dd>{number.number}</dd>
                  </div>
                </>
              )}
              {catalog.crosses.length > 0 && (
                <div>
                  <dt>Аналогів</dt>
                  <dd>
                    <a href="#crosses">{catalog.crosses.length}</a>
                  </dd>
                </div>
              )}
              {modelCount > 0 && (
                <div>
                  <dt>Моделей авто</dt>
                  <dd>
                    <a href="#fitment">{modelCount}</a>
                  </dd>
                </div>
              )}
            </dl>
          </div>
          <div className="ap-pdp-buy">
            <FitBadge car={garage} fitment={catalog.fitment} />
            <Suspense
              fallback={<ProductActions disabled={true} product={product} region={region} />}
            >
              <ProductActionsWrapper id={product.id} region={region} />
            </Suspense>
            <ul className="ap-buy-notes">
              <li>Нова пошта, Укрпошта або самовивіз</li>
              <li>Перед замовленням звірте номер деталі</li>
            </ul>
          </div>
        </section>

        {catalog.crosses.length > 0 && (
          <section className="ap-section ap-card" id="crosses">
            <div className="ap-section-head">
              <h2>Аналоги та оригінальні номери</h2>
              <p>
                За даними каталогів виробників. Натисніть підсвічений номер,
                щоб перейти до товару в нашому каталозі.
              </p>
            </div>
            <CrossTable title="Є в нашому каталозі" items={inStore} />
            <CrossTable
              title="Заміна від виробника"
              hint="Номер, яким виробник замінив цю деталь."
              items={replacements.filter((cross) => !cross.product)}
            />
            <CrossTable
              title="Оригінальні номери (OE)"
              hint="Номери автовиробників, яким відповідає ця деталь."
              items={oem.filter((cross) => !cross.product)}
            />
            <CrossTable
              title="Аналоги інших виробників"
              items={aftermarket.filter((cross) => !cross.product)}
            />
          </section>
        )}

        {catalog.fitment.length > 0 && (
          <section className="ap-section ap-card" id="fitment">
            <div className="ap-section-head">
              <h2>Підходить до авто</h2>
              <p>
                Марок: {catalog.fitment.length}, моделей: {modelCount}. Перелік
                з каталогу виробника; перед покупкою звірте номер деталі зі
                своїм авто.
              </p>
            </div>
            <div className="ap-makes">
              {catalog.fitment.map((make, index) => (
                <details key={make.make} open={catalog.fitment.length <= 2 && index === 0}>
                  <summary>
                    <strong>{make.make}</strong>
                    <span>моделей: {make.models.length}</span>
                  </summary>
                  <table className="ap-table ap-fit">
                    <thead>
                      <tr>
                        <th>Модель</th>
                        <th>Роки</th>
                        <th>Двигуни</th>
                      </tr>
                    </thead>
                    <tbody>
                      {make.models.map((model) => (
                        <tr key={model.model}>
                          <td>
                            <strong>{model.model || "—"}</strong>
                            {model.conditional ? " *" : ""}
                          </td>
                          <td className="ap-nowrap">{years(model.year_from, model.year_to)}</td>
                          <td className="ap-engines">
                            {model.engines.length
                              ? model.engines.join(" · ")
                              : "усі, зазначені виробником"}
                            {model.more_engines > 0 ? ` · ще ${model.more_engines}` : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              ))}
            </div>
          </section>
        )}

        {hasConditional && (
          <p className="ap-footnote">
            * Підходить за умов, указаних виробником (комплектація, дата
            випуску, сторона встановлення тощо). Уточніть перед замовленням.
          </p>
        )}

        {catalog.attributes.length > 0 && (
          <section className="ap-section ap-card" id="specs">
            <div className="ap-section-head">
              <h2>Характеристики</h2>
            </div>
            <table className="ap-table ap-facts">
              <tbody>
                {catalog.attributes.map((attribute) => (
                  <tr key={`${attribute.name}-${attribute.value}`}>
                    <th>{attribute.name}</th>
                    <td>
                      {attribute.value}
                      {attribute.unit ? ` ${attribute.unit}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <div className="ap-related" data-testid="related-products-container">
          <Suspense fallback={<SkeletonRelatedProducts />}>
            <RelatedProducts product={product} countryCode={countryCode} />
          </Suspense>
        </div>
      </div>
    </div>
  )
}

export default ProductTemplate
