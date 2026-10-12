import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  createSecurityEventStep,
  CreateSecurityEventInput,
} from "./steps/create-security-event"

export const recordSecurityEventWorkflow = createWorkflow(
  "record-security-event",
  function (input: CreateSecurityEventInput) {
    const event = createSecurityEventStep(input)

    return new WorkflowResponse(event)
  }
)
