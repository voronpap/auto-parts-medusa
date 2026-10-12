import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { SECURITY_MODULE } from "../../../../modules/security"
import {
  SECURITY_EVENT_CATEGORY_TYPES,
  SECURITY_EVENT_TYPES,
} from "../../../../modules/security/event-types"
import SecurityModuleService from "../../../../modules/security/service"

const WINDOW_HOURS = 24
const MAX_EVENTS = 5_000
const MAX_IPS = 20

type IpSummary = {
  ip: string
  total: number
  login_failed: number
  access_denied: number
  rate_limited: number
  last_seen: Date
}

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const securityService = req.scope.resolve<SecurityModuleService>(
    SECURITY_MODULE
  )
  const since = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000)
  const events = await securityService.listSecurityEvents(
    {
      type: {
        $in: SECURITY_EVENT_CATEGORY_TYPES.attacks,
      },
      created_at: {
        $gte: since,
      },
    },
    {
      select: ["id", "ip", "type", "created_at"],
      take: MAX_EVENTS,
      order: {
        created_at: "DESC",
      },
    }
  )
  const summaries = new Map<string, IpSummary>()

  for (const event of events) {
    const ip = event.ip || "unknown"
    let summary = summaries.get(ip)

    // Events arrive newest first, so the first one seen is the latest.
    if (!summary) {
      summary = {
        ip,
        total: 0,
        login_failed: 0,
        access_denied: 0,
        rate_limited: 0,
        last_seen: event.created_at,
      }
      summaries.set(ip, summary)
    }

    summary.total += 1

    if (event.type === SECURITY_EVENT_TYPES.LOGIN_FAILED) {
      summary.login_failed += 1
    } else if (event.type === SECURITY_EVENT_TYPES.RATE_LIMITED) {
      summary.rate_limited += 1
    } else {
      summary.access_denied += 1
    }
  }

  const ips = [...summaries.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, MAX_IPS)

  return res.status(200).json({
    window_hours: WINDOW_HOURS,
    truncated: events.length === MAX_EVENTS,
    ips,
  })
}
