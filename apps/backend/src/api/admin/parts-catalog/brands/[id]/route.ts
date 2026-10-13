import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  deletePartsBrandWorkflow,
  updatePartsBrandWorkflow,
} from "../../../../../workflows/parts-catalog"
import { UpdateBrandBody } from "../../middlewares"

export async function POST(
  req: AuthenticatedMedusaRequest<UpdateBrandBody>,
  res: MedusaResponse
) {
  const { result } = await updatePartsBrandWorkflow(req.scope).run({
    input: { id: req.params.id, ...req.validatedBody },
  })

  return res.status(200).json({ brand: result })
}

export async function DELETE(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const { id } = req.params

  await deletePartsBrandWorkflow(req.scope).run({ input: { id } })

  return res.status(200).json({ id, object: "parts_brand", deleted: true })
}
