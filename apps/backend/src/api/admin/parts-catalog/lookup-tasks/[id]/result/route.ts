import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ingestLookupResultWorkflow } from "../../../../../../workflows/parts-catalog"
import { LookupResultBody } from "../../schemas"

export async function POST(
  req: AuthenticatedMedusaRequest<LookupResultBody>,
  res: MedusaResponse
) {
  const { result } = await ingestLookupResultWorkflow(req.scope).run({
    input: {
      task_id: req.params.id,
      result: req.validatedBody,
    },
  })

  return res.status(200).json(result)
}
