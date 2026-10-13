/**
 * Checks that a typed number is identified by the running parser service.
 *
 *   NUMBER=101188 pnpm exec medusa exec ./src/scripts/smoke-number-search.ts
 *
 * Needs the auto-parts-identify service to be running.
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { PARTS_CATALOG_MODULE } from "../modules/parts-catalog"
import PartsCatalogModuleService from "../modules/parts-catalog/service"
import { startNumberSearchWorkflow } from "../workflows/parts-catalog"

export default async function smokeNumberSearch({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const catalog = container.resolve<PartsCatalogModuleService>(PARTS_CATALOG_MODULE)
  const started = Date.now()
  const { result } = await startNumberSearchWorkflow(container).run({
    input: { query: process.env.NUMBER ?? "101188" },
  })

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const search = await catalog.retrieveNumberSearch(result.id)

    if (search.status !== "pending") {
      logger.info(
        `OK ${search.status} in ${Date.now() - started} ms: ${JSON.stringify(search.candidates)} errors ${JSON.stringify(search.errors)}`
      )

      return
    }

    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  throw new Error("FAILED: nobody answered the search in 80 s")
}
