import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { openSupplyImportRunWorkflow } from "../../../../../../workflows/supply"
import { OpenImportRunBody } from "../../../middlewares"

export async function POST(
  req: AuthenticatedMedusaRequest<OpenImportRunBody>,
  res: MedusaResponse
) {
  const { result } = await openSupplyImportRunWorkflow(req.scope).run({
    input: { supplier_id: req.params.id, ...req.validatedBody },
  })

  return res.status(200).json({ import_run: result })
}
