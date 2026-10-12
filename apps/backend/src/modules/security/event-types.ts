export const SECURITY_EVENT_TYPES = {
  LOGIN_SUCCEEDED: "login_succeeded",
  LOGIN_FAILED: "login_failed",
  ACCESS_DENIED: "access_denied",
  RATE_LIMITED: "rate_limited",
  SERVER_ERROR: "server_error",
} as const

export const SECURITY_EVENT_CATEGORIES = ["logins", "errors", "attacks"] as const

export type SecurityEventCategory = (typeof SECURITY_EVENT_CATEGORIES)[number]

export const SECURITY_EVENT_CATEGORY_TYPES: Record<
  SecurityEventCategory,
  string[]
> = {
  logins: [
    SECURITY_EVENT_TYPES.LOGIN_SUCCEEDED,
    SECURITY_EVENT_TYPES.LOGIN_FAILED,
  ],
  errors: [SECURITY_EVENT_TYPES.SERVER_ERROR],
  attacks: [
    SECURITY_EVENT_TYPES.LOGIN_FAILED,
    SECURITY_EVENT_TYPES.ACCESS_DENIED,
    SECURITY_EVENT_TYPES.RATE_LIMITED,
  ],
}
