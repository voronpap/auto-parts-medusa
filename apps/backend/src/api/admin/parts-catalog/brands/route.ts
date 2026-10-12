import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { PARTS_CATALOG_MODULE } from "../../../../modules/parts-catalog"
import PartsCatalogModuleService from "../../../../modules/parts-catalog/service"
import { createPartsBrandWorkflow } from "../../../../workflows/parts-catalog"
import { CreateBrandBody, ListCatalogQuery } from "../middlewares"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const catalog = req.scope.resolve<PartsCatalogModuleService>(
    PARTS_CATALOG_MODULE
  )
  const { limit, offset, q } = req.validatedQuery as ListCatalogQuery
  const [brands, count] = await catalog.listAndCountBrands(q ? { q } : {}, {
    take: limit,
    skip: offset,
    relations: ["aliases"],
    order: { name: "ASC" },
  })

  return res.status(200).json({ brands, count, limit, offset })
}

export async function POST(
  req: AuthenticatedMedusaRequest<CreateBrandBody>,
  res: MedusaResponse
) {
  const { result } = await createPartsBrandWorkflow(req.scope).run({
    input: req.validatedBody,
  })

  return res.status(200).json({ brand: result })
}
