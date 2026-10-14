import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import productVariantPartNumber from "../../../../../../links/product-variant-part-number"
import { SUPPLY_MODULE } from "../../../../../../modules/supply"
import SupplyModuleService from "../../../../../../modules/supply/service"
import { createProductsFromSupplyOffersWorkflow } from "../../../../../../workflows/supply"

/**
 * The shop's product for a supplier's offer, made when a shopper first wants
 * to buy it. Returns the variant to put in the cart. Asking again for the same
 * offer returns the same product.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const supply = req.scope.resolve<SupplyModuleService>(SUPPLY_MODULE)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const [offer] = await supply.listSupplierOffers({ id: req.params.id, is_listed: true }, { take: 1 })

  if (!offer) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "This offer is no longer available")
  }

  const variantOf = async (partNumberId: string | null | undefined) => {
    if (!partNumberId) {
      return null
    }

    const { data: links } = await query.graph({
      entity: productVariantPartNumber.entryPoint,
      fields: ["product_variant_id", "product_variant.product.handle", "product_variant.product.status"],
      filters: { part_number_id: partNumberId },
    })
    const link = links.find((item) => item.product_variant?.product?.status === "published")

    return link
      ? { variant_id: link.product_variant_id, handle: link.product_variant!.product!.handle as string }
      : null
  }

  let found = await variantOf(offer.part_number_id)

  if (!found) {
    const [{ data: salesChannels }, { data: profiles }, { data: locations }, { data: categories }] =
      await Promise.all([
        query.graph({ entity: "sales_channel", fields: ["id"] }),
        query.graph({ entity: "shipping_profile", fields: ["id"] }),
        query.graph({ entity: "stock_location", fields: ["id"] }),
        query.graph({ entity: "product_category", fields: ["id", "name"] }),
      ])

    await createProductsFromSupplyOffersWorkflow(req.scope).run({
      input: {
        offer_ids: [offer.id],
        categories: Object.fromEntries(categories.map((category) => [category.name, category.id as string])),
        sales_channel_id: salesChannels[0].id,
        shipping_profile_id: profiles[0].id,
        location_id: (locations[0]?.id as string) ?? null,
      },
    })

    const [updated] = await supply.listSupplierOffers({ id: offer.id }, { take: 1 })
    found = await variantOf(updated?.part_number_id)
  }

  if (!found) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This offer cannot be sold yet")
  }

  return res.status(200).json(found)
}
