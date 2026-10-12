import { SubscriberArgs, type SubscriberConfig } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"

type VerificationRequestedEvent = {
  entity_id: string
  entity_type: string
  code: string
  code_provider: string
  auth_identity_id: string
  expires_at: string
}

export default async function emailVerificationHandler({
  event: { data },
  container,
}: SubscriberArgs<VerificationRequestedEvent>) {
  if (data.entity_type !== "email") {
    return
  }

  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const config = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE)
  const notificationModuleService = container.resolve(Modules.NOTIFICATION)

  if (!config.admin.storefrontUrl) {
    logger.error(
      "Verification email skipped: STOREFRONT_URL is not configured."
    )
    return
  }

  const verificationUrl = `${
    config.admin.storefrontUrl
  }/verify-account?token=${encodeURIComponent(
    data.code
  )}&email=${encodeURIComponent(data.entity_id)}`

  try {
    await notificationModuleService.createNotifications({
      to: data.entity_id,
      channel: "email",
      template: "email-verification",
      data: {
        verification_url: verificationUrl,
      },
    })

    logger.info("Verification email sent.")
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(`Failed to send verification email: ${message}`)
  }
}

export const config: SubscriberConfig = {
  event: "auth.verification_requested",
}
