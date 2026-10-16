import { normalizeImageUrl } from "../utils/images"
import { isAllowed, parseRobots } from "../utils/robots"

describe("normalizeImageUrl", () => {
  it("keeps http(s) addresses and completes protocol-relative ones", () => {
    expect(normalizeImageUrl(" https://a.example/x.jpg ")).toBe("https://a.example/x.jpg")
    expect(normalizeImageUrl("//cdn.example/p/1.jpg")).toBe("https://cdn.example/p/1.jpg")
  })

  it("rejects anything else", () => {
    expect(normalizeImageUrl("")).toBeNull()
    expect(normalizeImageUrl("/static/x.jpg")).toBeNull()
    expect(normalizeImageUrl("ftp://a.example/x.jpg")).toBeNull()
    expect(normalizeImageUrl("data:image/png;base64,AAAA")).toBeNull()
  })
})

describe("robots.txt", () => {
  const text = [
    "User-agent: bingbot",
    "Disallow: /",
    "",
    "User-agent: *",
    "Disallow: /private/",
    "Allow: /private/photos/",
    "Disallow: /*.pdf$",
  ].join("\n")
  const rules = parseRobots(text, "AutoPartsPpUaBot/1.0")

  it("uses the * group for an agent it does not name", () => {
    expect(isAllowed(rules, "/media/1.jpg")).toBe(true)
    expect(isAllowed(rules, "/private/a.jpg")).toBe(false)
  })

  it("lets the longest rule win and honours wildcards", () => {
    expect(isAllowed(rules, "/private/photos/a.jpg")).toBe(true)
    expect(isAllowed(rules, "/docs/a.pdf")).toBe(false)
    expect(isAllowed(rules, "/docs/a.pdf?x=1")).toBe(true)
  })

  it("applies a group that names the agent instead of *", () => {
    const own = parseRobots(text, "bingbot")
    expect(isAllowed(own, "/media/1.jpg")).toBe(false)
  })

  it("allows everything for an empty Disallow", () => {
    expect(isAllowed(parseRobots("User-agent: *\nDisallow:", "x"), "/a")).toBe(true)
  })
})
