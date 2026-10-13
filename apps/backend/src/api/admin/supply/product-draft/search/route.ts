import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { startNumberSearchWorkflow } from "../../../../../workflows/parts-catalog"
import { ProductDraftQuery } from "../../middlewares"

/** Puts the typed number to the parser service's sources. */
export async function POST(
  req: AuthenticatedMedusaRequest<ProductDraftQuery>,
  res: MedusaResponse
) {
  const { result } = await startNumberSearchWorkflow(req.scope).run({
    input: { query: req.validatedBody.q },
  })

  return res.status(200).json({ search: { id: result.id, status: result.status } })
}
