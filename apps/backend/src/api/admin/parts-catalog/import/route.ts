import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { importPartNumberResultWorkflow } from "../../../../workflows/parts-catalog"
import { ImportResultBody } from "../lookup-tasks/schemas"

// Loads what a catalogue read in bulk (a parsed PDF, say) states about one
// part number. The number is created if needed and no parser is queued.
export async function POST(
  req: AuthenticatedMedusaRequest<ImportResultBody>,
  res: MedusaResponse
) {
  const { result } = await importPartNumberResultWorkflow(req.scope).run({
    input: req.validatedBody,
  })

  return res.status(200).json(result)
}
