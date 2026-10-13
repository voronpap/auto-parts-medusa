import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { PARTS_CATALOG_MODULE } from "../../../../modules/parts-catalog"
import PartsCatalogModuleService from "../../../../modules/parts-catalog/service"

// Called by the parser service every couple of seconds to see whether the
// owner is waiting for an answer. Reading changes nothing, so it is a GET.
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const catalog = req.scope.resolve<PartsCatalogModuleService>(PARTS_CATALOG_MODULE)
  const searches = await catalog.listNumberSearches(
    {
      status: "pending",
      // An older question has nobody waiting for it any more.
      created_at: { $gt: new Date(Date.now() - 5 * 60 * 1000) },
    },
    { select: ["id", "query"], order: { created_at: "ASC" }, take: 5 }
  )

  return res.status(200).json({
    searches: searches.map((search) => ({ id: search.id, number: search.query })),
  })
}
