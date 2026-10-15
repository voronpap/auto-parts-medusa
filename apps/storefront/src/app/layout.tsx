import { getBaseURL } from "@lib/util/env"
import { Metadata } from "next"
import "styles/globals.css"
import "styles/steel.css"

export const metadata: Metadata = {
  metadataBase: new URL(getBaseURL()),
  // Every tab and search result names the shop: "Кошик | Auto Parts".
  title: { default: "Auto Parts", template: "%s | Auto Parts" },
}

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="uk" data-mode="light">
      <body>
        <main className="relative">{props.children}</main>
      </body>
    </html>
  )
}
