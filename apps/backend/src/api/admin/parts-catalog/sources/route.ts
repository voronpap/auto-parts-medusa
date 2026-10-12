import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { PARTS_CATALOG_MODULE } from "../../../../modules/parts-catalog"
import PartsCatalogModuleService from "../../../../modules/parts-catalog/service"
import { createPartsSourceWorkflow } from "../../../../workflows/parts-catalog"
import { CreateSourceBody, ListCatalogQuery } from "../middlewares"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const catalog = req.scope.resolve<PartsCatalogModuleService>(
    PARTS_CATALOG_MODULE
  )
  const { limit, offset, q } = req.validatedQuery as ListCatalogQuery
  const [sources, count] = await catalog.listAndCountSources(q ? { q } : {}, {
    take: limit,
    skip: offset,
    order: { name: "ASC" },
  })

  return res.status(200).json({ sources, count, limit, offset })
}

export async function POST(
  req: AuthenticatedMedusaRequest<CreateSourceBody>,
  res: MedusaResponse
) {
  const { result } = await createPartsSourceWorkflow(req.scope).run({
    input: req.validatedBody,
  })

  return res.status(200).json({ source: result })
}
