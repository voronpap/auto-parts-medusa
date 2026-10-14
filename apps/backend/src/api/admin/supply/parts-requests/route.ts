import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { SUPPLY_MODULE } from "../../../../modules/supply"
import SupplyModuleService from "../../../../modules/supply/service"

/** Shoppers' requests to pick a part, newest first. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const supply = req.scope.resolve<SupplyModuleService>(SUPPLY_MODULE)
  const status = typeof req.query.status === "string" ? req.query.status : undefined
  const [requests, count] = await supply.listAndCountPartsRequests(
    status ? { status: status as never } : {},
    { order: { created_at: "DESC" }, take: 100 }
  )

  return res.status(200).json({ requests, count })
}
