import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { SUPPLY_MODULE } from "../../../../modules/supply"
import SupplyModuleService from "../../../../modules/supply/service"
import { updateSupplyPricingSettingsWorkflow } from "../../../../workflows/supply"
import { UpdatePricingBody } from "../middlewares"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const supply = req.scope.resolve<SupplyModuleService>(SUPPLY_MODULE)
  const [settings] = await supply.listPricingSettings({}, { take: 1 })
  const rules = await supply.listPricingRules(
    {},
    { order: { brand: "ASC", price_from_minor: "ASC" }, take: 500 }
  )

  return res.status(200).json({
    settings: {
      default_markup_percent:
        settings?.default_markup_bp != null ? settings.default_markup_bp / 100 : null,
      rounding_step: (settings?.rounding_minor ?? 100) / 100,
      sync_stock: settings?.sync_stock ?? true,
      last_applied_at: settings?.last_applied_at ?? null,
      last_result: settings?.last_result ?? null,
    },
    rules: rules.map((rule) => ({
      id: rule.id,
      brand: rule.brand,
      price_from: rule.price_from_minor != null ? rule.price_from_minor / 100 : null,
      price_to: rule.price_to_minor != null ? rule.price_to_minor / 100 : null,
      markup_percent: rule.markup_bp / 100,
    })),
  })
}

export async function POST(
  req: AuthenticatedMedusaRequest<UpdatePricingBody>,
  res: MedusaResponse
) {
  await updateSupplyPricingSettingsWorkflow(req.scope).run({
    input: req.validatedBody,
  })

  return res.status(200).json({ updated: true })
}
