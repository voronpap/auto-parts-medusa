import { Metadata } from "next"
import { notFound } from "next/navigation"

import {
  catalogPartHref,
  CatalogCross,
  retrieveCatalogPart,
} from "@lib/data/catalog"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import PartsRequestForm from "@modules/parts-request/request-form"
import PdpGallery from "@modules/products/components/pdp-gallery"

type Props = {
  params: Promise<{ countryCode: string; brand: string; number: string }>
}

const years = (from: number | null, to: number | null) => {
  if (from && to) return from === to ? `${from}` : `${from}–${to}`
  if (from) return `з ${from}`
  if (to) return `до ${to}`

  return "—"
}

const load = async (props: Props) => {
  const { brand, number } = await props.params

  return retrieveCatalogPart(decodeURIComponent(brand), decodeURIComponent(number))
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const part = await load(props)

  if (!part) {
    return { title: "Деталь не знайдено" }
  }

  const name = `${part.brand} ${part.number}`

  return {
    title: part.type || part.title ? `${name} — ${part.type ?? part.title}` : name,
    description: `${name}${part.type || part.title ? `, ${part.type ?? part.title}` : ""}: аналоги, оригінальні номери, застосовність. Замовлення під поставку.`,
    alternates: { canonical: `/ua${catalogPartHref(part.brand, part.number_norm)}` },
  }
}

const CrossTable = ({
  title,
  hint,
  items,
}: {
  title: string
  hint?: string
  items: CatalogCross[]
}) => {
  if (!items.length) {
    return null
  }

  // One row per maker keeps long lists readable.
  const byBrand = new Map<string, CatalogCross[]>()

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
                        key={cross.number_norm}
                        className="ap-number ap-in-store"
                        href={`/products/${cross.product.handle}`}
                        title={`${cross.product.title} — є в магазині`}
                      >
                        {cross.number}
                      </LocalizedClientLink>
                    ) : (
                      <LocalizedClientLink
                        key={cross.number_norm}
                        className="ap-number"
                        href={catalogPartHref(cross.brand, cross.number_norm)}
                        title={cross.title ?? undefined}
                      >
                        {cross.number}
                      </LocalizedClientLink>
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

/**
 * A part number as the makers' catalogues describe it, whether or not the
 * shop stocks it. Not stocked parts are ordered through a request.
 */
export default async function CatalogPartPage(props: Props) {
  const part = await load(props)

  if (!part) {
    notFound()
  }

  const name = `${part.brand} ${part.number}`
  const heading = part.type ?? part.title ?? name
  const crossCount =
    part.oe.length + part.analogs.length + part.newer.length + part.older.length
  const modelCount = part.fitment.reduce((sum, make) => sum + make.models.length, 0)
  const inStore = [...part.newer, ...part.analogs, ...part.oe, ...part.older].filter(
    (cross) => cross.product
  )

  return (
    <div className="ap-scope ap-page" data-testid="catalog-part-container">
      <div className="ap-shell">
        <nav className="ap-crumbs" aria-label="Навігація">
          <LocalizedClientLink href="/">Головна</LocalizedClientLink>
          <span>/</span>
          <LocalizedClientLink href="/store">Каталог</LocalizedClientLink>
          <span>/</span>
          <b>{name}</b>
        </nav>

        <section className="ap-pdp ap-card">
          <PdpGallery photos={part.images} title={heading} />
          <div className="ap-pdp-info">
            <div className="ap-eyebrow">
              {part.brand} · {part.number}
            </div>
            <h1 className="ap-pdp-title">{heading}</h1>
            {part.description && <p className="ap-lead">{part.description}</p>}
            <dl className="ap-keyfacts">
              <div>
                <dt>Виробник</dt>
                <dd>{part.brand}</dd>
              </div>
              <div>
                <dt>Артикул</dt>
                <dd>{part.number}</dd>
              </div>
              {part.category && (
                <div>
                  <dt>Група</dt>
                  <dd>{part.category}</dd>
                </div>
              )}
              {part.oe.length > 0 && (
                <div>
                  <dt>OE-номерів</dt>
                  <dd>
                    <a href="#crosses">{part.oe.length}</a>
                  </dd>
                </div>
              )}
              {crossCount - part.oe.length > 0 && (
                <div>
                  <dt>Аналогів</dt>
                  <dd>
                    <a href="#crosses">{crossCount - part.oe.length}</a>
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
            {part.product ? (
              <>
                <p className="ap-fit ap-fit-yes">Є в магазині</p>
                <LocalizedClientLink
                  className="ap-btn"
                  href={`/products/${part.product.handle}`}
                >
                  До товару
                </LocalizedClientLink>
              </>
            ) : (
              <>
                {part.discontinued && (
                  <p className="ap-fit ap-fit-none">Знято з виробництва</p>
                )}
                <p className="ap-hint">
                  Під замовлення: менеджер перевірить наявність і ціну в
                  постачальників і зателефонує.
                </p>
                <a className="ap-btn" href="#order">
                  Замовити
                </a>
              </>
            )}
            <ul className="ap-buy-notes">
              <li>Нова пошта, Укрпошта або самовивіз</li>
              <li>Перед замовленням звірте номер деталі</li>
            </ul>
          </div>
        </section>

        {crossCount > 0 && (
          <section className="ap-section ap-card" id="crosses">
            <div className="ap-section-head">
              <h2>Аналоги та оригінальні номери</h2>
              <p>
                За даними каталогів виробників і TecDoc. Підсвічені номери є в
                магазині; решта відкривається карткою номера.
              </p>
            </div>
            <CrossTable title="Є в магазині" items={inStore} />
            <CrossTable
              title="Заміна від виробника"
              hint="Номер, яким виробник замінив цю деталь."
              items={part.newer.filter((cross) => !cross.product)}
            />
            <CrossTable
              title="Оригінальні номери (OE)"
              hint="Номери автовиробників, яким відповідає ця деталь."
              items={part.oe.filter((cross) => !cross.product)}
            />
            <CrossTable
              title="Аналоги інших виробників"
              items={part.analogs.filter((cross) => !cross.product)}
            />
            <CrossTable
              title="Попередні номери"
              hint="Номери, які ця деталь замінила."
              items={part.older.filter((cross) => !cross.product)}
            />
          </section>
        )}

        {part.fitment.length > 0 && (
          <section className="ap-section ap-card" id="fitment">
            <div className="ap-section-head">
              <h2>Підходить до авто</h2>
              <p>
                Марок: {part.fitment.length}, моделей: {modelCount}
                {part.fitment_truncated ? " (показано частину переліку)" : ""}.
                Перед покупкою звірте номер деталі зі своїм авто.
              </p>
            </div>
            <div className="ap-makes">
              {part.fitment.map((make, index) => (
                <details key={make.make} open={part.fitment.length <= 2 && index === 0}>
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

        {part.characteristics.length > 0 && (
          <section className="ap-section ap-card" id="specs">
            <div className="ap-section-head">
              <h2>Характеристики</h2>
            </div>
            <table className="ap-table ap-facts">
              <tbody>
                {part.characteristics.map((attribute) => (
                  <tr key={`${attribute.name}-${attribute.value}`}>
                    <th>{attribute.name}</th>
                    <td>{attribute.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {part.documents.length > 0 && (
              <p className="ap-hint">
                Документи:{" "}
                {part.documents.map((document, index) => (
                  <span key={document.url}>
                    {index > 0 ? ", " : ""}
                    <a className="ap-link" href={document.url} target="_blank" rel="noopener noreferrer nofollow">
                      {document.name}
                    </a>
                  </span>
                ))}
              </p>
            )}
          </section>
        )}

        {!part.product && (
          <section className="ap-section ap-card" id="order">
            <div className="ap-section-head">
              <h2>Замовити {name}</h2>
              <p>
                Залиште телефон: менеджер підтвердить наявність, ціну й строк
                поставки. VIN допоможе перевірити, що деталь підходить.
              </p>
            </div>
            <PartsRequestForm
              message={`Замовлення: ${name} — ${heading}`}
              submitLabel="Замовити"
            />
          </section>
        )}
      </div>
    </div>
  )
}
