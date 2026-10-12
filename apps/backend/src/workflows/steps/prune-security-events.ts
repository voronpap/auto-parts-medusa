import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { SECURITY_MODULE } from "../../modules/security"
import SecurityModuleService from "../../modules/security/service"

export type PruneSecurityEventsInput = {
  before: Date
  batch_size: number
}

type RestorableSecurityEvent = {
  id: string
  type: string
  severity: string
  source: string
  ip?: string | null
  method?: string | null
  path?: string | null
  status?: number | null
  request_id?: string | null
  actor_id?: string | null
  metadata?: Record<string, unknown> | null
}

export const pruneSecurityEventsStep = createStep(
  "prune-security-events",
  async (input: PruneSecurityEventsInput, { container }) => {
    const securityService = container.resolve<SecurityModuleService>(
      SECURITY_MODULE
    )
    const events = await securityService.listSecurityEvents(
      {
        created_at: {
          $lt: input.before,
        },
      },
      {
        take: input.batch_size,
        order: {
          created_at: "ASC",
        },
      }
    )

    if (!events.length) {
      return new StepResponse({ deleted: 0 }, [])
    }

    const restorable = events.map((event) => ({
      id: event.id,
      type: event.type,
      severity: event.severity,
      source: event.source,
      ip: event.ip,
      method: event.method,
      path: event.path,
      status: event.status,
      request_id: event.request_id,
      actor_id: event.actor_id,
      metadata: event.metadata as Record<string, unknown> | null,
    }))

    await securityService.deleteSecurityEvents(events.map((event) => event.id))

    return new StepResponse({ deleted: events.length }, restorable)
  },
  async (events: RestorableSecurityEvent[] | undefined, { container }) => {
    if (!events?.length) {
      return
    }

    const securityService = container.resolve<SecurityModuleService>(
      SECURITY_MODULE
    )
    await securityService.createSecurityEvents(events)
  }
)
