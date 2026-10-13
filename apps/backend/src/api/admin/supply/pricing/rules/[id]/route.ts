import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { deleteSupplyPricingRuleWorkflow } from "../../../../../../workflows/supply"

export async function DELETE(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const { id } = req.params

  await deleteSupplyPricingRuleWorkflow(req.scope).run({ input: { id } })

  return res.status(200).json({ id, object: "pricing_rule", deleted: true })
}
