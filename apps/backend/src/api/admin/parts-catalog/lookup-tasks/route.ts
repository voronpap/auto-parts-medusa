import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { createLookupTaskWorkflow } from "../../../../workflows/parts-catalog"
import { CreateLookupTaskBody } from "./schemas"

export async function POST(
  req: AuthenticatedMedusaRequest<CreateLookupTaskBody>,
  res: MedusaResponse
) {
  const { result } = await createLookupTaskWorkflow(req.scope).run({
    input: req.validatedBody,
  })

  return res.status(200).json({ lookup_task: result })
}
