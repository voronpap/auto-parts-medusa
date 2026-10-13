import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { importSupplyOfferRowsWorkflow } from "../../../../../../workflows/supply"
import { ImportRowsBody } from "../../../middlewares"

export async function POST(
  req: AuthenticatedMedusaRequest<ImportRowsBody>,
  res: MedusaResponse
) {
  const { result } = await importSupplyOfferRowsWorkflow(req.scope).run({
    input: { run_id: req.params.id, rows: req.validatedBody.rows },
  })

  return res.status(200).json(result)
}
