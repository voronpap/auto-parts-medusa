import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { createPartRelationshipWorkflow } from "../../../../workflows/parts-catalog"
import { CreatePartRelationshipBody } from "../middlewares"

export async function POST(
  req: AuthenticatedMedusaRequest<CreatePartRelationshipBody>,
  res: MedusaResponse
) {
  const { result } = await createPartRelationshipWorkflow(req.scope).run({
    input: req.validatedBody,
  })

  return res.status(200).json({ relationship: result })
}
