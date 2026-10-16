import { HttpTypes } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import AddButton from "./add-button"
import PartImage from "./part-image"

export { PartIcon } from "./part-icon"

export const money = (amount: number | null | undefined) =>
  `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(
    amount ?? 0,
  )} ₴`

export const isAvailable = (variant?: HttpTypes.StoreProductVariant) =>
  Boolean(variant) &&
  (!variant!.manage_inventory ||
    Boolean(variant!.allow_backorder) ||
    (variant!.inventory_quantity ?? 0) > 0)

const Stock = ({ variant }: { variant?: HttpTypes.StoreProductVariant }) => {
  if (!isAvailable(variant)) {
    return <span className="ap-stock ap-none">Немає в наявності</span>
  }

  return <span className="ap-stock">● В наявності</span>
}

export default function ProductTable({
  products,
  countryCode,
  notes,
}: {
  products: HttpTypes.StoreProduct[]
  countryCode: string
  /** A line under a product saying why it is in the list, by product id. */
  notes?: Record<string, string>
}) {
  return (
    <table className="ap-table ap-products">
      <thead>
        <tr>
          <th>Товар</th>
          <th>Наявність</th>
          <th>Ціна</th>
          <th>
            <span className="sr-only">Дія</span>
          </th>
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
                    <PartImage
                      src={product.thumbnail || product.images?.[0]?.url}
                      title={product.title}
                      size={48}
                    />
                  </span>
                  <span>
                    <strong>{product.title}</strong>
                    <small>{product.subtitle || variant?.sku || ""}</small>
                    {notes?.[product.id!] && (
                      <em className="ap-why">{notes[product.id!]}</em>
                    )}
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
