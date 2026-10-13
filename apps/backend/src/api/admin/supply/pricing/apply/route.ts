import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { applySupplyOffersToProductsWorkflow } from "../../../../../workflows/supply"

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const { result } = await applySupplyOffersToProductsWorkflow(req.scope).run()

  return res.status(200).json(result)
}
