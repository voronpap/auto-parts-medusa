import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { PARTS_CATALOG_MODULE } from "../../../../../modules/parts-catalog"
import PartsCatalogModuleService from "../../../../../modules/parts-catalog/service"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const catalog = req.scope.resolve<PartsCatalogModuleService>(
    PARTS_CATALOG_MODULE
  )
  const { id } = req.params
  const make = await catalog.retrieveVehicleMake(id, {
    relations: ["aliases"],
  })
  const models = await catalog.listVehicleModels(
    { make_id: id },
    { relations: ["aliases"], order: { name: "ASC" }, take: null }
  )
  const applications = await catalog.listPartApplications(
    { vehicle_make_id: id },
    { select: ["id", "vehicle_model_id"], take: null }
  )
  const applicationCounts = new Map<string, number>()

  for (const application of applications) {
    if (application.vehicle_model_id) {
      applicationCounts.set(
        application.vehicle_model_id,
        (applicationCounts.get(application.vehicle_model_id) ?? 0) + 1
      )
    }
  }

  return res.status(200).json({
    vehicle_make: make,
    vehicle_models: models.map((model) => ({
      ...model,
      application_count: applicationCounts.get(model.id) ?? 0,
    })),
    application_count: applications.length,
  })
}
