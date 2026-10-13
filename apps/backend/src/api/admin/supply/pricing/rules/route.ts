import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { createSupplyPricingRuleWorkflow } from "../../../../../workflows/supply"
import { CreatePricingRuleBody } from "../../middlewares"

export async function POST(
  req: AuthenticatedMedusaRequest<CreatePricingRuleBody>,
  res: MedusaResponse
) {
  const { result } = await createSupplyPricingRuleWorkflow(req.scope).run({
    input: req.validatedBody,
  })

  return res.status(200).json({ rule: result })
}
