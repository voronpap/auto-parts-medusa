import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { pruneStockHoldsWorkflow } from "../workflows/stock"

// An expired hold already counts nowhere; removing it keeps the table small.
export default async function pruneStockHoldsJob(container: MedusaContainer) {
  try {
    await pruneStockHoldsWorkflow(container).run({ input: { before: new Date() } })
  } catch (error) {
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .error(`Stock holds cleanup failed: ${(error as Error).message}`)
  }
}

export const config = {
  name: "prune-stock-holds",
  schedule: "* * * * *",
}
