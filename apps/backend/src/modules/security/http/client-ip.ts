type HeaderValue = string | string[] | undefined

type ClientIpRequest = {
  headers: Record<string, HeaderValue>
  socket: {
    remoteAddress?: string
  }
}

function firstHeaderValue(value: HeaderValue): string | undefined {
  if (Array.isArray(value)) {
    return value[0]
  }

  return value?.split(",", 1)[0]?.trim()
}

function normalizeIp(value?: string): string | undefined {
  if (!value) {
    return undefined
  }

  if (value.startsWith("::ffff:")) {
    return value.slice(7)
  }

  return value
}

function isLoopback(value?: string): boolean {
  const normalized = normalizeIp(value)

  return normalized === "127.0.0.1" || normalized === "::1"
}

export function resolveClientIp(req: ClientIpRequest): string {
  const peerIp = normalizeIp(req.socket.remoteAddress)

  if (isLoopback(peerIp)) {
    const realIp = normalizeIp(firstHeaderValue(req.headers["x-real-ip"]))
    const cloudflareIp = normalizeIp(
      firstHeaderValue(req.headers["cf-connecting-ip"])
    )

    return realIp || cloudflareIp || peerIp || "unknown"
  }

  return peerIp || "unknown"
}
