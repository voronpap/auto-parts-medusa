import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { createPartsRequestWorkflow } from "../../../workflows/supply"

const Body = z.object({
  name: z.string().trim().min(1).max(100),
  phone: z
    .string()
    .trim()
    .min(5)
    .max(30)
    .regex(/^[+\d\s()-]+$/, "phone"),
  vin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-HJ-NPR-Z0-9]{17}$/, "vin")
    .nullish()
    .or(z.literal("").transform(() => null)),
  car: z.string().trim().max(200).nullish(),
  message: z.string().trim().min(3).max(2000),
  // A field people do not see; robots that fill every field are refused.
  website: z.string().max(0).optional(),
})

/** A shopper asks the shop to pick a part by VIN or car. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = Body.safeParse(req.body)

  if (!parsed.success) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Check the name, phone, VIN and message")
  }

  const { website: _, ...input } = parsed.data
  const { result } = await createPartsRequestWorkflow(req.scope).run({ input })

  return res.status(200).json({ request: { id: result.id } })
}
