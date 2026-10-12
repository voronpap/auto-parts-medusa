import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { PARTS_CATALOG_MODULE } from "../../../../modules/parts-catalog"
import PartsCatalogModuleService from "../../../../modules/parts-catalog/service"
import { createVehicleMakeWorkflow } from "../../../../workflows/parts-catalog"
import { CreateVehicleMakeBody } from "../middlewares"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const catalog = req.scope.resolve<PartsCatalogModuleService>(
    PARTS_CATALOG_MODULE
  )
  const makes = await catalog.listVehicleMakes(
    {},
    { relations: ["aliases"], order: { name: "ASC" }, take: null }
  )
  const models = await catalog.listVehicleModels(
    {},
    { select: ["id", "make_id"], take: null }
  )
  const modelCounts = new Map<string, number>()

  for (const model of models) {
    modelCounts.set(model.make_id, (modelCounts.get(model.make_id) ?? 0) + 1)
  }

  return res.status(200).json({
    vehicle_makes: makes.map((make) => ({
      ...make,
      model_count: modelCounts.get(make.id) ?? 0,
    })),
    count: makes.length,
  })
}

export async function POST(
  req: AuthenticatedMedusaRequest<CreateVehicleMakeBody>,
  res: MedusaResponse
) {
  const { result } = await createVehicleMakeWorkflow(req.scope).run({
    input: req.validatedBody,
  })

  return res.status(200).json({ vehicle_make: result })
}
