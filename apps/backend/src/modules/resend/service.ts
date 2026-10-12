import {
  AbstractNotificationProviderService,
  MedusaError,
} from "@medusajs/framework/utils"
import {
  Logger,
  ProviderSendNotificationDTO,
  ProviderSendNotificationResultsDTO,
} from "@medusajs/framework/types"
import { Resend } from "resend"
import { EMAIL_TEMPLATES } from "./templates"

type InjectedDependencies = {
  logger: Logger
}

type ResendOptions = {
  api_key: string
  from: string
}

class ResendNotificationProviderService extends AbstractNotificationProviderService {
  static identifier = "notification-resend"

  private readonly client: Resend
  private readonly options: ResendOptions
  private readonly logger: Logger

  constructor({ logger }: InjectedDependencies, options: ResendOptions) {
    super()

    this.client = new Resend(options.api_key)
    this.options = options
    this.logger = logger
  }

  static validateOptions(options: Record<string, unknown>): void {
    if (!options.api_key) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Option `api_key` is required in the Resend provider's options."
      )
    }

    if (!options.from) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Option `from` is required in the Resend provider's options."
      )
    }
  }

  async send(
    notification: ProviderSendNotificationDTO
  ): Promise<ProviderSendNotificationResultsDTO> {
    const template = EMAIL_TEMPLATES[notification.template]

    if (!template) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `No email template is registered for "${notification.template}".`
      )
    }

    const content = template(notification.data ?? {})

    const { data, error } = await this.client.emails.send({
      from: this.options.from,
      to: [notification.to],
      subject: content.subject,
      html: content.html,
    })

    if (error || !data) {
      this.logger.error(
        `Resend rejected the "${notification.template}" email: ${
          error?.message ?? "unknown error"
        }`
      )

      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "The email could not be sent."
      )
    }

    return { id: data.id }
  }
}

export default ResendNotificationProviderService
