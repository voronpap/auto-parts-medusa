import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { normalizePartNumber } from "../../../../modules/parts-catalog/utils/normalize"
import { SUPPLY_MODULE } from "../../../../modules/supply"
import SupplyModuleService from "../../../../modules/supply/service"
import { ListOffersQuery } from "../middlewares"

/** Offers of suppliers: for a catalog number, a supplier, or a typed number. */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const supply = req.scope.resolve<SupplyModuleService>(SUPPLY_MODULE)
  const { limit, offset, part_number_id, supplier_id, q } =
    req.validatedQuery as ListOffersQuery
  const [offers, count] = await supply.listAndCountSupplierOffers(
    {
      ...(part_number_id ? { part_number_id } : {}),
      ...(supplier_id ? { supplier_id } : {}),
      ...(q ? { normalized_number: normalizePartNumber(q) } : {}),
    },
    {
      relations: ["supplier"],
      take: limit,
      skip: offset,
      order: { is_listed: "DESC", price_minor: "ASC" },
    }
  )

  return res.status(200).json({ offers, count, limit, offset })
}
