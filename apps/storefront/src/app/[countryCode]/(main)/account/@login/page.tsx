import { Metadata } from "next"

import LoginTemplate from "@modules/account/templates/login-template"

export const metadata: Metadata = {
  title: "Увійти",
  description: "Вхід до облікового запису Auto Parts.",
}

export default function Login() {
  return <LoginTemplate />
}
