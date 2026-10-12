import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { useEffect } from "react"
import { useTranslation } from "react-i18next"

const LANGUAGE_INITIALIZED_KEY = "auto_parts_admin_language_initialized"

const SetDefaultAdminLanguage = () => {
  const { i18n } = useTranslation()

  useEffect(() => {
    if (window.localStorage.getItem(LANGUAGE_INITIALIZED_KEY)) {
      return
    }

    void i18n.changeLanguage("uk").then(() => {
      window.localStorage.setItem(LANGUAGE_INITIALIZED_KEY, "true")
    })
  }, [i18n])

  return null
}

export const config = defineWidgetConfig({
  zone: "store.details.before",
})

export default SetDefaultAdminLanguage
