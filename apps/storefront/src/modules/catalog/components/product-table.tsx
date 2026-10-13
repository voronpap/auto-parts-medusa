import { HttpTypes } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import AddButton from "./add-button"

export const money = (amount: number | null | undefined) =>
  `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(
    amount ?? 0
  )} ₴`

export const PartIcon = ({ title }: { title: string }) => {
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

export const isAvailable = (variant?: HttpTypes.StoreProductVariant) =>
  Boolean(variant) &&
  (!variant!.manage_inventory ||
    Boolean(variant!.allow_backorder) ||
    (variant!.inventory_quantity ?? 0) > 0)

const Stock = ({ variant }: { variant?: HttpTypes.StoreProductVariant }) => {
  const quantity = variant?.inventory_quantity ?? 0

  if (!isAvailable(variant)) {
    return <span className="ap-stock ap-none">Немає в наявності</span>
  }

  return (
    <span className="ap-stock">
      ●{" "}
      {variant!.manage_inventory && quantity > 0
        ? `${quantity} шт. на складі`
        : "В наявності"}
    </span>
  )
}

export default function ProductTable({
  products,
  countryCode,
}: {
  products: HttpTypes.StoreProduct[]
  countryCode: string
}) {
  return (
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
                    <small>{product.subtitle || variant?.sku || ""}</small>
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
                  disabled={!isAvailable(variant) || price == null}
                />
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
