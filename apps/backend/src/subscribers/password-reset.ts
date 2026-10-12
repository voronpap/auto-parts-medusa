import { SubscriberArgs, type SubscriberConfig } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"

type PasswordResetEvent = {
  entity_id: string
  token: string
  actor_type: string
}

export default async function passwordResetHandler({
  event: { data },
  container,
}: SubscriberArgs<PasswordResetEvent>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const config = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE)
  const notificationModuleService = container.resolve(Modules.NOTIFICATION)

  let urlPrefix: string

  if (data.actor_type === "customer") {
    if (!config.admin.storefrontUrl) {
      logger.error(
        "Password reset email skipped: STOREFRONT_URL is not configured."
      )
      return
    }

    urlPrefix = config.admin.storefrontUrl
  } else {
    const backendUrl =
      config.admin.backendUrl && config.admin.backendUrl !== "/"
        ? config.admin.backendUrl
        : "http://localhost:9000"

    urlPrefix = `${backendUrl}${config.admin.path}`
  }

  const resetUrl = `${urlPrefix}/reset-password?token=${encodeURIComponent(
    data.token
  )}&email=${encodeURIComponent(data.entity_id)}`

  try {
    await notificationModuleService.createNotifications({
      to: data.entity_id,
      channel: "email",
      template: "password-reset",
      data: {
        reset_url: resetUrl,
      },
    })

    logger.info(`Password reset email sent (${data.actor_type}).`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(`Failed to send password reset email: ${message}`)
  }
}

export const config: SubscriberConfig = {
  event: "auth.password_reset",
}
