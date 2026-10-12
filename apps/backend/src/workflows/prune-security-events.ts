import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  pruneSecurityEventsStep,
  PruneSecurityEventsInput,
} from "./steps/prune-security-events"

export const pruneSecurityEventsWorkflow = createWorkflow(
  "prune-security-events",
  function (input: PruneSecurityEventsInput) {
    const result = pruneSecurityEventsStep(input)

    return new WorkflowResponse(result)
  }
)
