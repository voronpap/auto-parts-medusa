import {
  catalogPartHref,
  CatalogRelation,
  CatalogSearchPart,
} from "@lib/data/catalog"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import PartImage from "./part-image"

const RELATION: Record<CatalogRelation, string> = {
  number: "Шуканий номер",
  newer: "Заміна від виробника",
  analog: "Аналог",
  oe: "Оригінальний номер (OE)",
  older: "Попередній номер",
}

/**
 * Numbers found in the makers' catalogues for a search: the number itself,
 * its analogues and OE numbers. Stocked ones lead to the product, the rest to
 * the part card where they can be ordered.
 */
export default function CatalogPartTable({ parts }: { parts: CatalogSearchPart[] }) {
  return (
    <table className="ap-table ap-products">
      <thead>
        <tr>
          <th>Деталь</th>
          <th>Що це</th>
          <th>
            <span className="sr-only">Дія</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {parts.map((part) => {
          const name = `${part.brand} ${part.number}`
          const href = part.product
            ? `/products/${part.product.handle}`
            : catalogPartHref(part.brand, part.number_norm)

          return (
            <tr key={`${part.brand}|${part.number_norm}`}>
              <td>
                <LocalizedClientLink className="ap-part" href={href}>
                  <span className="ap-part-img">
                    <PartImage src={part.image} title={part.type ?? part.title ?? name} size={48} />
                  </span>
                  <span>
                    <strong>{name}</strong>
                    <small>
                      {part.type ?? part.title ?? part.category ?? ""}
                      {part.discontinued ? " · знято з виробництва" : ""}
                    </small>
                  </span>
                </LocalizedClientLink>
              </td>
              <td>{RELATION[part.relation]}</td>
              <td>
                {part.product ? (
                  <LocalizedClientLink className="ap-btn" href={href}>
                    У магазині
                  </LocalizedClientLink>
                ) : (
                  <LocalizedClientLink className="ap-btn ap-btn-ghost" href={`${href}#order`}>
                    Замовити
                  </LocalizedClientLink>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
