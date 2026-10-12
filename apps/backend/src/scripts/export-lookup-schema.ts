/**
 * Writes the JSON Schema of a lookup result to docs/, so the parser service
 * validates against the same definition the API enforces.
 *
 *   pnpm exec medusa exec ./src/scripts/export-lookup-schema.ts
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { writeFile } from "fs/promises"
import path from "path"
import { LookupResultSchema } from "../api/admin/parts-catalog/lookup-tasks/schemas"

export default async function exportLookupSchema({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const target = path.resolve(
    process.cwd(),
    "../../docs/lookup-result.schema.json"
  )
  // "input" describes what a client may send, before defaults are applied.
  const schema = z.toJSONSchema(LookupResultSchema, { io: "input" })

  await writeFile(target, `${JSON.stringify(schema, null, 2)}\n`, "utf-8")
  logger.info(`Lookup result schema written to ${target}`)
}
