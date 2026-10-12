import { MedusaService } from "@medusajs/framework/utils"
import SecurityEvent from "./models/security-event"

class SecurityModuleService extends MedusaService({
  SecurityEvent,
}) {}

export default SecurityModuleService
