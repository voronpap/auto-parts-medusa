import { getClientIpHeader } from "@lib/util/get-client-ip-header"
import { getLocaleHeader } from "@lib/util/get-locale-header"
import Medusa, { FetchArgs, FetchInput } from "@medusajs/js-sdk"

// Defaults to standard port for Medusa server
let MEDUSA_BACKEND_URL = "http://localhost:9000"

if (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL) {
  MEDUSA_BACKEND_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL
}

// Server-side requests can skip the public reverse proxy. The variable is not
// NEXT_PUBLIC, so it is undefined in the browser bundle.
if (process.env.MEDUSA_BACKEND_INTERNAL_URL) {
  MEDUSA_BACKEND_URL = process.env.MEDUSA_BACKEND_INTERNAL_URL
}

export const sdk = new Medusa({
  baseUrl: MEDUSA_BACKEND_URL,
  debug: process.env.NODE_ENV === "development",
  publishableKey: process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
})

const originalFetch = sdk.client.fetch.bind(sdk.client)

sdk.client.fetch = async <T>(
  input: FetchInput,
  init?: FetchArgs
): Promise<T> => {
  const headers = init?.headers ?? {}
  let localeHeader: Record<string, string | null> | undefined
  try {
    localeHeader = await getLocaleHeader()
    headers["x-medusa-locale"] ??= localeHeader["x-medusa-locale"]
  } catch {}

  // Writes go out from this server, so the backend would see one IP for every
  // customer. Pass the visitor's address on for its rate limiter and audit log.
  // GET requests are left alone: the header would split Next's data cache.
  let clientIpHeader: Record<string, string> | undefined
  if (
    typeof window === "undefined" &&
    (init?.method ?? "GET").toUpperCase() !== "GET"
  ) {
    try {
      clientIpHeader = await getClientIpHeader()
    } catch {}
  }

  const newHeaders = {
    ...localeHeader,
    ...clientIpHeader,
    ...headers,
  }
  init = {
    ...init,
    headers: newHeaders,
  }
  return originalFetch(input, init)
}
