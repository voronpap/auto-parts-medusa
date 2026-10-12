import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { SECURITY_MODULE } from "../../../modules/security"
import SecurityModuleService from "../../../modules/security/service"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const securityService = req.scope.resolve<SecurityModuleService>(
    SECURITY_MODULE
  )

  try {
    await securityService.listSecurityEvents({}, { take: 1 })

    return res.status(200).json({
      status: "ok",
      module: SECURITY_MODULE,
      version: "1.0.0",
    })
  } catch {
    return res.status(503).json({
      status: "unavailable",
      module: SECURITY_MODULE,
    })
  }
}
