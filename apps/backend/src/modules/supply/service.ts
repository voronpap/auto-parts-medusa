import { MedusaService } from "@medusajs/framework/utils"
import ImportRun from "./models/import-run"
import OfferObservation from "./models/offer-observation"
import PartsRequest from "./models/parts-request"
import PricingRule from "./models/pricing-rule"
import PricingSettings from "./models/pricing-settings"
import Supplier from "./models/supplier"
import SupplierOffer from "./models/supplier-offer"

class SupplyModuleService extends MedusaService({
  Supplier,
  ImportRun,
  SupplierOffer,
  OfferObservation,
  PricingSettings,
  PricingRule,
  PartsRequest,
}) {}

export default SupplyModuleService
