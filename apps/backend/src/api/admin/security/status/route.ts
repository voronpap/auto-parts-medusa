import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { SECURITY_MODULE } from "../../../../modules/security"
import { SECURITY_EVENT_TYPES } from "../../../../modules/security/event-types"
import SecurityModuleService from "../../../../modules/security/service"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const securityService = req.scope.resolve<SecurityModuleService>(
    SECURITY_MODULE
  )
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const countSince = async (type?: string) => {
    const [, count] = await securityService.listAndCountSecurityEvents(
      {
        ...(type ? { type } : {}),
        created_at: {
          $gte: since,
        },
      },
      { take: 1 }
    )

    return count
  }
  const [, total] = await securityService.listAndCountSecurityEvents(
    {},
    { take: 1 }
  )
  const [
    last24Hours,
    loginSucceeded,
    loginFailed,
    accessDenied,
    rateLimited,
    serverErrors,
  ] = await Promise.all([
    countSince(),
    countSince(SECURITY_EVENT_TYPES.LOGIN_SUCCEEDED),
    countSince(SECURITY_EVENT_TYPES.LOGIN_FAILED),
    countSince(SECURITY_EVENT_TYPES.ACCESS_DENIED),
    countSince(SECURITY_EVENT_TYPES.RATE_LIMITED),
    countSince(SECURITY_EVENT_TYPES.SERVER_ERROR),
  ])

  return res.status(200).json({
    status: "ok",
    retention_days: readRetentionDays(),
    events: {
      total,
      last_24_hours: last24Hours,
      login_succeeded_last_24_hours: loginSucceeded,
      login_failed_last_24_hours: loginFailed,
      access_denied_last_24_hours: accessDenied,
      rate_limited_last_24_hours: rateLimited,
      server_errors_last_24_hours: serverErrors,
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
