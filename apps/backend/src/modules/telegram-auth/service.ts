import type {
  AuthenticationInput,
  AuthenticationResponse,
  AuthIdentityProviderService,
} from "@medusajs/framework/types"
import { AbstractAuthModuleProvider, MedusaError } from "@medusajs/framework/utils"
import { createHash, createHmac, timingSafeEqual } from "crypto"

type Options = {
  /** Token of the shop's bot from @BotFather; never leaves the backend. */
  botToken: string
  /** A sign-in older than this is refused, so a captured link cannot be reused. */
  maxAgeSeconds?: number
}

export type TelegramLogin = {
  id: string
  first_name?: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: string
  hash: string
}

const FIELDS = ["id", "first_name", "last_name", "username", "photo_url", "auth_date"] as const

/**
 * Checks the data the Telegram Login Widget sends back: Telegram signs it
 * with a key made from the bot's token, so only Telegram can produce a
 * matching hash (https://core.telegram.org/widgets/login#checking-authorization).
 */
export function verifyTelegramLogin(
  data: Record<string, unknown>,
  botToken: string,
  maxAgeSeconds = 86_400,
  now = Date.now()
): TelegramLogin | null {
  const hash = typeof data.hash === "string" ? data.hash : ""
  const authDate = Number(data.auth_date)

  if (!/^[0-9a-f]{64}$/.test(hash) || !Number.isFinite(authDate) || !data.id) {
    return null
  }

  if (now / 1000 - authDate > maxAgeSeconds) {
    return null
  }

  const checkString = FIELDS.filter((field) => data[field] !== undefined && data[field] !== "")
    .sort()
    .map((field) => `${field}=${data[field]}`)
    .join("\n")
  const secret = createHash("sha256").update(botToken).digest()
  const expected = createHmac("sha256", secret).update(checkString).digest()

  if (!timingSafeEqual(expected, Buffer.from(hash, "hex"))) {
    return null
  }

  return Object.fromEntries(
    [...FIELDS, "hash"].filter((field) => data[field] !== undefined).map((field) => [field, String(data[field])])
  ) as TelegramLogin
}

class TelegramAuthProviderService extends AbstractAuthModuleProvider {
  static identifier = "telegram"
  static DISPLAY_NAME = "Telegram"

  protected options_: Options

  static validateOptions(options: Record<string, unknown>) {
    if (!options.botToken) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Telegram sign-in needs botToken")
    }
  }

  constructor(_: Record<string, unknown>, options: Options) {
    super()
    this.options_ = options
  }

  async authenticate(
    data: AuthenticationInput,
    authIdentityService: AuthIdentityProviderService
  ): Promise<AuthenticationResponse> {
    const login = verifyTelegramLogin(
      { ...(data.query ?? {}), ...(data.body ?? {}) },
      this.options_.botToken,
      this.options_.maxAgeSeconds
    )

    if (!login) {
      return { success: false, error: "Telegram sign-in could not be verified" }
    }

    const metadata = {
      telegram_id: login.id,
      first_name: login.first_name ?? null,
      last_name: login.last_name ?? null,
      username: login.username ?? null,
    }

    try {
      const authIdentity = await authIdentityService.retrieve({ entity_id: login.id })

      return { success: true, authIdentity }
    } catch (error) {
      if ((error as MedusaError).type !== MedusaError.Types.NOT_FOUND) {
        return { success: false, error: (error as Error).message }
      }
    }

    const authIdentity = await authIdentityService.create({
      entity_id: login.id,
      user_metadata: metadata,
    })

    return { success: true, authIdentity }
  }

  async register(
    data: AuthenticationInput,
    authIdentityService: AuthIdentityProviderService
  ): Promise<AuthenticationResponse> {
    return this.authenticate(data, authIdentityService)
  }
}

export default TelegramAuthProviderService
