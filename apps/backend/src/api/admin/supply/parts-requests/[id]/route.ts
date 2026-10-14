import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { updatePartsRequestWorkflow } from "../../../../../workflows/supply"

const Body = z.object({
  status: z.enum(["new", "in_progress", "answered", "closed"]).optional(),
  note: z.string().max(2000).nullish(),
})

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const parsed = Body.safeParse(req.body)

  if (!parsed.success) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Unknown status")
  }

  const { result } = await updatePartsRequestWorkflow(req.scope).run({
    input: { id: req.params.id, ...parsed.data },
  })

  return res.status(200).json({ request: result })
}
