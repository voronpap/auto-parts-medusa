import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import TelegramAuthProviderService from "./service"

export default ModuleProvider(Modules.AUTH, {
  services: [TelegramAuthProviderService],
})
