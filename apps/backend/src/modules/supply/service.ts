import { MedusaService } from "@medusajs/framework/utils"
import ImportRun from "./models/import-run"
import OfferObservation from "./models/offer-observation"
import Supplier from "./models/supplier"
import SupplierOffer from "./models/supplier-offer"

class SupplyModuleService extends MedusaService({
  Supplier,
  ImportRun,
  SupplierOffer,
  OfferObservation,
}) {}

export default SupplyModuleService
