import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { SUPPLY_MODULE } from "../../../../modules/supply"
import SupplyModuleService from "../../../../modules/supply/service"
import { createSupplierWorkflow } from "../../../../workflows/supply"
import { CreateSupplierBody } from "../middlewares"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const supply = req.scope.resolve<SupplyModuleService>(SUPPLY_MODULE)
  const suppliers = await supply.listSuppliers(
    {},
    { order: { name: "ASC" }, take: 200 }
  )
  const runs = await supply.listImportRuns(
    { supplier_id: suppliers.map((supplier) => supplier.id) },
    { order: { created_at: "DESC" }, take: 400 }
  )

  return res.status(200).json({
    suppliers: suppliers.map((supplier) => ({
      ...supplier,
      // The newest price list of the supplier, loading or loaded.
      last_run: runs.find((run) => run.supplier_id === supplier.id) ?? null,
    })),
  })
}

export async function POST(
  req: AuthenticatedMedusaRequest<CreateSupplierBody>,
  res: MedusaResponse
) {
  const { result } = await createSupplierWorkflow(req.scope).run({
    input: req.validatedBody,
  })

  return res.status(200).json({ supplier: result })
}
