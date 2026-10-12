import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { mergeVehicleModelsWorkflow } from "../../../../../workflows/parts-catalog"
import { MergeVehiclesBody } from "../../middlewares"

export async function POST(
  req: AuthenticatedMedusaRequest<MergeVehiclesBody>,
  res: MedusaResponse
) {
  const { result } = await mergeVehicleModelsWorkflow(req.scope).run({
    input: req.validatedBody,
  })

  return res.status(200).json(result)
}
