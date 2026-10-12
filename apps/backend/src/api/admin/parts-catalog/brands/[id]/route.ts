import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { deletePartsBrandWorkflow } from "../../../../../workflows/parts-catalog"

export async function DELETE(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const { id } = req.params

  await deletePartsBrandWorkflow(req.scope).run({ input: { id } })

  return res.status(200).json({ id, object: "parts_brand", deleted: true })
}
