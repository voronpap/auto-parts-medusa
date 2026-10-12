import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { SECURITY_MODULE } from "../../../../modules/security"
import SecurityModuleService from "../../../../modules/security/service"
import { GetSecurityEventsQuery } from "./middlewares"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const securityService = req.scope.resolve<SecurityModuleService>(
    SECURITY_MODULE
  )
  const { limit, offset, type, severity } =
    req.validatedQuery as GetSecurityEventsQuery
  const filters: Record<string, string> = {}

  if (type) {
    filters.type = type
  }

  if (severity) {
    filters.severity = severity
  }

  const [events, count] = await securityService.listAndCountSecurityEvents(
    filters,
    {
      take: limit,
      skip: offset,
      order: {
        created_at: "DESC",
      },
    }
  )

  return res.status(200).json({
    events,
    count,
    limit,
    offset,
  })
}
