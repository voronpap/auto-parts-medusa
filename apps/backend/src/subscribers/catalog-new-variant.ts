import { SubscriberArgs, type SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { NumberType } from "../modules/parts-catalog/constants"
import { catalogProductWorkflow } from "../workflows/parts-catalog/catalog-product"

type LinkedVariant = {
  id: string
  product_id?: string | null
  part_numbers?:
    | ({ number_type: NumberType; brand?: { id: string } | null } | null)[]
    | null
}

// When a variant is added to a product that is already in the parts catalog,
// catalog the new variant under the same brand and number type, so its SKU
// goes to the parser service without anyone repeating the choice.
export default async function catalogNewVariantHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  try {
    const { data: created } = await query.graph({
      entity: "product_variant",
      fields: ["id", "product_id"],
      filters: { id: data.id },
    })
    const productId = (created[0] as LinkedVariant | undefined)?.product_id

    if (!productId) {
      return
    }

    const { data: siblings } = await query.graph({
      entity: "product_variant",
      fields: [
        "id",
        "part_numbers.number_type",
        "part_numbers.brand.id",
      ],
      filters: { product_id: productId },
    })
    const known = (siblings as LinkedVariant[])
      .flatMap((variant) => variant.part_numbers ?? [])
      .find((partNumber) => partNumber?.brand?.id)

    if (!known?.brand) {
      return
    }

    await catalogProductWorkflow(container).run({
      input: {
        product_id: productId,
        brand_id: known.brand.id,
        number_type: known.number_type,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(`Could not catalog new variant ${data.id}: ${message}`)
  }
}

export const config: SubscriberConfig = {
  event: "product-variant.created",
}
