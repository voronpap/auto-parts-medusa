import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { PARTS_CATALOG_MODULE } from "../../../../../modules/parts-catalog"
import PartsCatalogModuleService from "../../../../../modules/parts-catalog/service"

/**
 * A kept response with its content. With `?raw=1` only the content is
 * returned, as plain text, so it can be opened in a browser tab; it is never
 * served as HTML, because it is a page of someone else's site.
 */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const catalog = req.scope.resolve<PartsCatalogModuleService>(
    PARTS_CATALOG_MODULE
  )
  const document = await catalog.retrieveSourceDocument(req.params.id)

  if (req.query.raw) {
    res.setHeader("Content-Type", "text/plain; charset=utf-8")
    res.setHeader("X-Content-Type-Options", "nosniff")

    return res.status(200).send(document.body)
  }

  return res.status(200).json({ document })
}
