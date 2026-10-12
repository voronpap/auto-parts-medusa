import { resolveClientIp } from "../http/client-ip"

describe("resolveClientIp", () => {
  it("trusts X-Real-IP only from a loopback reverse proxy", () => {
    expect(
      resolveClientIp({
        headers: {
          "x-real-ip": "203.0.113.10",
        },
        socket: {
          remoteAddress: "::ffff:127.0.0.1",
        },
      })
    ).toBe("203.0.113.10")
  })

  it("ignores spoofed forwarding headers from remote peers", () => {
    expect(
      resolveClientIp({
        headers: {
          "x-real-ip": "203.0.113.10",
        },
        socket: {
          remoteAddress: "198.51.100.7",
        },
      })
    ).toBe("198.51.100.7")
  })
})
