/**
 * Fills the vehicle make directory with common makes and their spellings.
 * Makes that already exist under any of their names are skipped, so it is
 * safe to run again.
 *
 *   pnpm exec medusa exec ./src/scripts/seed-vehicle-makes.ts
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { VEHICLE_MAKE_SEED } from "../modules/parts-catalog/vehicle-makes"
import { seedVehicleMakesWorkflow } from "../workflows/parts-catalog"

export default async function seedVehicleMakes({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const { result } = await seedVehicleMakesWorkflow(container).run({
    input: { makes: VEHICLE_MAKE_SEED },
  })

  logger.info(
    `Vehicle makes: ${result.created} created, ${result.skipped} already present`
  )
}
