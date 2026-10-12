import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { pruneSecurityEventsWorkflow } from "../workflows/prune-security-events"

const BATCH_SIZE = 1_000
const MAX_BATCHES = 20

export default async function pruneSecurityEventsJob(
  container: MedusaContainer
) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const retentionDays = readPositiveInteger(
    "SECURITY_AUDIT_RETENTION_DAYS",
    30
  )
  const before = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)
  let deleted = 0

  try {
    for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
      const { result } = await pruneSecurityEventsWorkflow(container).run({
        input: {
          before,
          batch_size: BATCH_SIZE,
        },
      })

      deleted += result.deleted

      if (result.deleted < BATCH_SIZE) {
        break
      }
    }

    logger.info(`Security audit cleanup removed ${deleted} old events`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(`Security audit cleanup failed: ${message}`)
  }
}

function readPositiveInteger(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] || "", 10)

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export const config = {
  name: "prune-security-events-daily",
  schedule: "43 2 * * *",
}
