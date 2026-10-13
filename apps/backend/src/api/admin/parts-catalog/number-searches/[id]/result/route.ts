import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { completeNumberSearchWorkflow } from "../../../../../../workflows/parts-catalog"
import { NumberSearchResultBody } from "../../../middlewares"

// Called by the parser service with what its sources list under the number.
export async function POST(
  req: AuthenticatedMedusaRequest<NumberSearchResultBody>,
  res: MedusaResponse
) {
  const { result } = await completeNumberSearchWorkflow(req.scope).run({
    input: { id: req.params.id, ...req.validatedBody },
  })

  return res.status(200).json({ search: { id: result.id, status: result.status } })
}
