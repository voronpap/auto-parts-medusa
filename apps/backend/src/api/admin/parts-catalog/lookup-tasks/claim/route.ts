import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { claimLookupTasksWorkflow } from "../../../../../workflows/parts-catalog"
import { ClaimLookupTasksBody } from "../schemas"

// Called by the parser service to take work. Claiming changes task state, so
// it is a POST.
export async function POST(
  req: AuthenticatedMedusaRequest<ClaimLookupTasksBody>,
  res: MedusaResponse
) {
  const { result } = await claimLookupTasksWorkflow(req.scope).run({
    input: req.validatedBody,
  })

  return res.status(200).json({ tasks: result })
}
