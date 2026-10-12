/**
 * Creates the secret API key the parser service signs in with and writes it
 * straight into apps/parsers/.env. The key is never printed or logged; it can
 * be seen (redacted) and revoked in the admin under Settings -> Secret API keys.
 *
 * Does nothing if the service already has a key. To replace one, revoke it in
 * the admin, delete apps/parsers/.env and run this again.
 *
 *   pnpm exec medusa exec ./src/scripts/provision-parsers-key.ts
 */
import type { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { createApiKeysWorkflow } from "@medusajs/medusa/core-flows"
import { access, writeFile } from "fs/promises"
import path from "path"

const KEY_TITLE = "Сервіс парсерів"

export default async function provisionParsersKey({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const envFile = path.resolve(process.cwd(), "../parsers/.env")

  try {
    await access(envFile)
    logger.info("The parser service already has a key file; nothing changed")
    return
  } catch {
    // No key file yet: create one.
  }

  const { data: users } = await query.graph({
    entity: "user",
    fields: ["id"],
  })

  if (!users.length) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "No admin user exists to own the API key"
    )
  }

  const { result } = await createApiKeysWorkflow(container).run({
    input: {
      api_keys: [
        { title: KEY_TITLE, type: "secret", created_by: users[0].id },
      ],
    },
  })

  await writeFile(envFile, `CATALOG_API_KEY=${result[0].token}\n`, {
    mode: 0o600,
  })
  logger.info(`Secret API key "${KEY_TITLE}" created and stored for the parser service`)
}
