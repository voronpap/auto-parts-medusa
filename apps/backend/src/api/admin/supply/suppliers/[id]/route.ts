import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { deleteSupplierWorkflow } from "../../../../../workflows/supply"

export async function DELETE(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const { id } = req.params

  await deleteSupplierWorkflow(req.scope).run({ input: { id } })

  return res.status(200).json({ id, object: "supplier", deleted: true })
}
