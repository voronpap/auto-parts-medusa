import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { mergeVehicleMakesWorkflow } from "../../../../../workflows/parts-catalog"
import { MergeVehiclesBody } from "../../middlewares"

export async function POST(
  req: AuthenticatedMedusaRequest<MergeVehiclesBody>,
  res: MedusaResponse
) {
  const { result } = await mergeVehicleMakesWorkflow(req.scope).run({
    input: req.validatedBody,
  })

  return res.status(200).json(result)
}
