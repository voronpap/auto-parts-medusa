import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  deletePartRelationshipWorkflow,
  updatePartRelationshipWorkflow,
} from "../../../../../workflows/parts-catalog"
import { UpdatePartRelationshipBody } from "../../middlewares"

export async function POST(
  req: AuthenticatedMedusaRequest<UpdatePartRelationshipBody>,
  res: MedusaResponse
) {
  const { result } = await updatePartRelationshipWorkflow(req.scope).run({
    input: { id: req.params.id, ...req.validatedBody },
  })

  return res.status(200).json({ relationship: result })
}

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
