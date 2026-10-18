import { MedusaService } from "@medusajs/framework/utils"
import StockHold from "./models/stock-hold"
import StockSettings from "./models/stock-settings"

class StockModuleService extends MedusaService({
  StockHold,
  StockSettings,
}) {}

export default StockModuleService
