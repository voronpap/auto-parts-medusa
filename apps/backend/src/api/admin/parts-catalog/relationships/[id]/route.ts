import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { deletePartRelationshipWorkflow } from "../../../../../workflows/parts-catalog"

export async function DELETE(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const { id } = req.params

  await deletePartRelationshipWorkflow(req.scope).run({ input: { id } })

  return res
    .status(200)
    .json({ id, object: "part_relationship", deleted: true })
}
