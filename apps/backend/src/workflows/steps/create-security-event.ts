import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { SECURITY_MODULE } from "../../modules/security"
import SecurityModuleService from "../../modules/security/service"

export type CreateSecurityEventInput = {
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

export const createSecurityEventStep = createStep(
  "create-security-event",
  async (input: CreateSecurityEventInput, { container }) => {
    const securityService = container.resolve<SecurityModuleService>(
      SECURITY_MODULE
    )
    const event = await securityService.createSecurityEvents(input)

    return new StepResponse(event, event.id)
  },
  async (eventId: string | undefined, { container }) => {
    if (!eventId) {
      return
    }

    const securityService = container.resolve<SecurityModuleService>(
      SECURITY_MODULE
    )
    await securityService.deleteSecurityEvents(eventId)
  }
)
