// robots.txt rules for one user agent, enough to decide whether a path may
// be fetched: groups by User-agent, Allow/Disallow with "*" and "$", and the
// longest matching rule wins (Allow on a tie), as in RFC 9309.

type Rule = { allow: boolean; pattern: string }

const toRegExp = (pattern: string) => {
  const anchored = pattern.endsWith("$")
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*")

  return new RegExp(`^${body}${anchored ? "$" : ""}`)
}

/** The rules that apply to `agent` (its own group, else the "*" group). */
export function parseRobots(text: string, agent: string): Rule[] {
  const groups: { agents: string[]; rules: Rule[] }[] = []
  let current: { agents: string[]; rules: Rule[] } | null = null
  let readingAgents = false

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim()
    const colon = line.indexOf(":")

    if (colon < 0) {
      continue
    }

    const key = line.slice(0, colon).trim().toLowerCase()
    const value = line.slice(colon + 1).trim()

    if (key === "user-agent") {
      if (!current || !readingAgents) {
        current = { agents: [], rules: [] }
        groups.push(current)
      }
      current.agents.push(value.toLowerCase())
      readingAgents = true
    } else if ((key === "allow" || key === "disallow") && current) {
      readingAgents = false
      // An empty Disallow allows everything and adds no rule.
      if (value) {
        current.rules.push({ allow: key === "allow", pattern: value })
      }
    }
  }

  const name = agent.toLowerCase()
  const own = groups.filter((group) =>
    group.agents.some((item) => item !== "*" && name.includes(item))
  )

  return (own.length ? own : groups.filter((group) => group.agents.includes("*")))
    .flatMap((group) => group.rules)
}

export function isAllowed(rules: Rule[], path: string): boolean {
  let best: Rule | null = null

  for (const rule of rules) {
    if (!toRegExp(rule.pattern).test(path)) {
      continue
    }

    if (
      !best ||
      rule.pattern.length > best.pattern.length ||
      (rule.pattern.length === best.pattern.length && rule.allow)
    ) {
      best = rule
    }
  }

  return best ? best.allow : true
}
