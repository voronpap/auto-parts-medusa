export type RateLimitResult = {
  allowed: boolean
  remaining: number
  resetAt: number
  retryAfterSeconds: number
}

type WindowState = {
  count: number
  resetAt: number
}

export class FixedWindowRateLimiter {
  private readonly windows = new Map<string, WindowState>()

  constructor(private readonly maxKeys = 10_000) {}

  check(
    key: string,
    limit: number,
    windowMs: number,
    now = Date.now()
  ): RateLimitResult {
    let state = this.windows.get(key)

    if (!state || state.resetAt <= now) {
      this.ensureCapacity(now)
      state = {
        count: 0,
        resetAt: now + windowMs,
      }
      this.windows.set(key, state)
    }

    state.count += 1

    const allowed = state.count <= limit
    const remaining = Math.max(0, limit - state.count)
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((state.resetAt - now) / 1000)
    )

    return {
      allowed,
      remaining,
      resetAt: state.resetAt,
      retryAfterSeconds,
    }
  }

  size(): number {
    return this.windows.size
  }

  private ensureCapacity(now: number): void {
    if (this.windows.size < this.maxKeys) {
      return
    }

    for (const [key, state] of this.windows) {
      if (state.resetAt <= now) {
        this.windows.delete(key)
      }
    }

    if (this.windows.size < this.maxKeys) {
      return
    }

    let oldestKey: string | undefined
    let oldestReset = Number.POSITIVE_INFINITY

    for (const [key, state] of this.windows) {
      if (state.resetAt < oldestReset) {
        oldestKey = key
        oldestReset = state.resetAt
      }
    }

    if (oldestKey) {
      this.windows.delete(oldestKey)
    }
  }
}
