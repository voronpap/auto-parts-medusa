import { randomUUID } from "crypto"
import {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { recordSecurityEventWorkflow } from "../../../workflows/record-security-event"
import { SECURITY_EVENT_TYPES } from "../event-types"
import { resolveClientIp } from "./client-ip"
import { FixedWindowRateLimiter } from "./rate-limiter"

type RateLimitProfile = {
  name: string
  limit: number
  windowMs: number
}

type RequestWithAuth = MedusaRequest & {
  auth_context?: {
    actor_id?: string
  }
}

const limiter = new FixedWindowRateLimiter(
  readPositiveInteger("SECURITY_RATE_LIMIT_MAX_KEYS", 10_000)
)

function readPositiveInteger(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] || "", 10)

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function getRateLimitProfile(
  method: string,
  path: string
): RateLimitProfile | undefined {
  if (method === "POST" && /^\/auth(?:\/|$)/.test(path)) {
    return {
      name: "auth",
      limit: readPositiveInteger("SECURITY_RATE_LIMIT_AUTH", 10),
      windowMs: 60_000,
    }
  }

  if (method === "POST" && path === "/store/search") {
    return {
      name: "store-search",
      limit: readPositiveInteger("SECURITY_RATE_LIMIT_SEARCH", 60),
      windowMs: 60_000,
    }
  }

  if (/^\/(?:store|admin|api)\/ai(?:\/|$)/.test(path)) {
    return {
      name: "ai",
      limit: readPositiveInteger("SECURITY_RATE_LIMIT_AI", 30),
      windowMs: 60_000,
    }
  }

  if (
    (method === "POST" || method === "DELETE") &&
    /^\/admin(?:\/|$)/.test(path)
  ) {
    return {
      name: "admin-write",
      limit: readPositiveInteger("SECURITY_RATE_LIMIT_ADMIN_WRITE", 120),
      windowMs: 60_000,
    }
  }

  return undefined
}

function getRequestId(req: MedusaRequest): string {
  const raw = req.headers["x-request-id"]
  const candidate = Array.isArray(raw) ? raw[0] : raw

  if (candidate && /^[A-Za-z0-9._:-]{8,128}$/.test(candidate)) {
    return candidate
  }

  return randomUUID()
}

// POST /auth/{actor}/{provider}, e.g. /auth/user/emailpass.
function isLoginAttempt(method: string, path: string): boolean {
  return method === "POST" && /^\/auth\/[^/]+\/[^/]+\/?$/.test(path)
}

function getAuditEvent(status: number, method: string, path: string) {
  if (status === 429) {
    return {
      type: SECURITY_EVENT_TYPES.RATE_LIMITED,
      severity: "warning",
    }
  }

  if (isLoginAttempt(method, path)) {
    if (status === 200) {
      return {
        type: SECURITY_EVENT_TYPES.LOGIN_SUCCEEDED,
        severity: "info",
      }
    }

    if (status === 401) {
      return {
        type: SECURITY_EVENT_TYPES.LOGIN_FAILED,
        severity: "warning",
      }
    }
  }

  if (status === 401 || status === 403) {
    return {
      type: SECURITY_EVENT_TYPES.ACCESS_DENIED,
      severity: "warning",
    }
  }

  if (status >= 500) {
    return {
      type: SECURITY_EVENT_TYPES.SERVER_ERROR,
      severity: "error",
    }
  }

  return undefined
}

function setSecurityHeaders(
  req: MedusaRequest,
  res: MedusaResponse,
  requestId: string
): void {
  res.setHeader("X-Request-ID", requestId)
  res.setHeader("X-Content-Type-Options", "nosniff")
  res.setHeader("X-Frame-Options", "DENY")
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin")
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()"
  )
  res.setHeader(
    "Content-Security-Policy",
    "base-uri 'self'; frame-ancestors 'none'; object-src 'none'"
  )

  if (req.headers["x-forwarded-proto"] === "https") {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    )
  }
}

export async function securityMiddleware(
  req: RequestWithAuth,
  res: MedusaResponse,
  next: MedusaNextFunction
): Promise<void> {
  const requestId = getRequestId(req)
  const clientIp = resolveClientIp(req)
  // Mounted with a regex matcher, so req.path is relative to the match ("/").
  const path = req.originalUrl.split("?", 1)[0]
  const profile = getRateLimitProfile(req.method, path)

  setSecurityHeaders(req, res, requestId)

  res.once("finish", () => {
    const audit = getAuditEvent(res.statusCode, req.method, path)

    if (!audit) {
      return
    }

    const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)

    void recordSecurityEventWorkflow(req.scope)
      .run({
        input: {
          type: audit.type,
          severity: audit.severity,
          source: "http",
          ip: clientIp,
          method: req.method,
          path,
          status: res.statusCode,
          request_id: requestId,
          actor_id: req.auth_context?.actor_id || null,
          metadata: profile
            ? {
                rate_limit_profile: profile.name,
              }
            : null,
        },
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        logger.error(`Failed to record security event: ${message}`)
      })
  })

  if (!profile) {
    next()
    return
  }

  const result = limiter.check(
    `${profile.name}:${clientIp}`,
    profile.limit,
    profile.windowMs
  )

  res.setHeader("X-RateLimit-Limit", profile.limit.toString())
  res.setHeader("X-RateLimit-Remaining", result.remaining.toString())
  res.setHeader("X-RateLimit-Reset", Math.ceil(result.resetAt / 1000).toString())

  if (!result.allowed) {
    res.setHeader("Retry-After", result.retryAfterSeconds.toString())
    res.status(429).json({
      type: "rate_limit_exceeded",
      message: "Too many requests. Try again later.",
      request_id: requestId,
    })
    return
  }

  next()
}
