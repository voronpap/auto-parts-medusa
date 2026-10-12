import { FixedWindowRateLimiter } from "../http/rate-limiter"

describe("FixedWindowRateLimiter", () => {
  it("allows requests up to the limit and then rejects", () => {
    const limiter = new FixedWindowRateLimiter()

    expect(limiter.check("auth:ip", 2, 60_000, 1_000).allowed).toBe(true)
    expect(limiter.check("auth:ip", 2, 60_000, 1_001).allowed).toBe(true)
    expect(limiter.check("auth:ip", 2, 60_000, 1_002).allowed).toBe(false)
  })

  it("starts a new window after the reset time", () => {
    const limiter = new FixedWindowRateLimiter()

    limiter.check("auth:ip", 1, 1_000, 1_000)
    expect(limiter.check("auth:ip", 1, 1_000, 1_500).allowed).toBe(false)
    expect(limiter.check("auth:ip", 1, 1_000, 2_000).allowed).toBe(true)
  })

  it("bounds the number of tracked keys", () => {
    const limiter = new FixedWindowRateLimiter(2)

    limiter.check("one", 1, 60_000, 1_000)
    limiter.check("two", 1, 60_000, 1_001)
    limiter.check("three", 1, 60_000, 1_002)

    expect(limiter.size()).toBe(2)
  })
})
