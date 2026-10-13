import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { requeueProductNumbersWorkflow } from "../../../../../workflows/parts-catalog"

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const { result } = await requeueProductNumbersWorkflow(req.scope).run()

  return res.status(200).json(result)
}
