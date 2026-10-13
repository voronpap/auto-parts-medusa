import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { finishSupplyImportRunWorkflow } from "../../../../../../workflows/supply"

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const { result } = await finishSupplyImportRunWorkflow(req.scope).run({
    input: { run_id: req.params.id },
  })

  return res.status(200).json({ import_run: result })
}
