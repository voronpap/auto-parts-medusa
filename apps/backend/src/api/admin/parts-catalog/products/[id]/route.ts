import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { catalogProductWorkflow } from "../../../../../workflows/parts-catalog/catalog-product"
import { CatalogProductBody } from "../../middlewares"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: variants } = await query.graph({
    entity: "product_variant",
    fields: [
      "id",
      "title",
      "sku",
      "part_numbers.id",
      "part_numbers.display_number",
      "part_numbers.number_type",
      "part_numbers.brand.id",
      "part_numbers.brand.name",
    ],
    filters: { product_id: req.params.id },
  })

  return res.status(200).json({ variants })
}

export async function POST(
  req: AuthenticatedMedusaRequest<CatalogProductBody>,
  res: MedusaResponse
) {
  const { result } = await catalogProductWorkflow(req.scope).run({
    input: {
      product_id: req.params.id,
      ...req.validatedBody,
    },
  })

  return res.status(200).json({
    linked: result.links.length,
    numbers_created: result.numbers_created,
    variants_without_sku: result.variants_without_sku,
  })
}
