import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { SECURITY_MODULE } from "../../../../modules/security"
import SecurityModuleService from "../../../../modules/security/service"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const securityService = req.scope.resolve<SecurityModuleService>(
    SECURITY_MODULE
  )
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const [, total] = await securityService.listAndCountSecurityEvents(
    {},
    { take: 1 }
  )
  const [, last24Hours] = await securityService.listAndCountSecurityEvents(
    {
      created_at: {
        $gte: since,
      },
    },
    { take: 1 }
  )
  const [, rateLimitedLast24Hours] =
    await securityService.listAndCountSecurityEvents(
      {
        type: "rate_limited",
        created_at: {
          $gte: since,
        },
      },
      { take: 1 }
    )

  return res.status(200).json({
    status: "ok",
    retention_days: readRetentionDays(),
    events: {
      total,
      last_24_hours: last24Hours,
      rate_limited_last_24_hours: rateLimitedLast24Hours,
    },
  })
}

function readRetentionDays(): number {
  const parsed = Number.parseInt(
    process.env.SECURITY_AUDIT_RETENTION_DAYS || "",
    10
  )

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30
}
