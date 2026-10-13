import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { mergePartsBrandsWorkflow } from "../../../../../workflows/parts-catalog"
import { MergeBrandsBody } from "../../middlewares"

export async function POST(
  req: AuthenticatedMedusaRequest<MergeBrandsBody>,
  res: MedusaResponse
) {
  const { result } = await mergePartsBrandsWorkflow(req.scope).run({
    input: req.validatedBody,
  })

  return res.status(200).json(result)
}
