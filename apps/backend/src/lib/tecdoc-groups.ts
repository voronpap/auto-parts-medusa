import type { ParsersDb } from "./parsers-db"

/**
 * The TecDoc tree of part groups for passenger cars (tecdoc_group, type P),
 * with Ukrainian names, held in memory: it is small and changes rarely.
 */

export type GroupNode = {
  id: number
  parent_id: number | null
  name: string
  sort: number
}

// Service roots hold the same parts as the working sections ("parts that need
// servicing", accessories, tools); a part is shown there only when it has no
// working section.
export const SERVICE_ROOTS = new Set([100019, 100733, 706365])

const TTL_MS = 60 * 60 * 1000

let cache: { at: number; nodes: Map<number, GroupNode> } | null = null

export async function groupTree(db: ParsersDb): Promise<Map<number, GroupNode>> {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return cache.nodes
  }

  const rows: GroupNode[] = await db("tecdoc_group")
    .select("id", "parent_id", db.raw("coalesce(name_uk, name) as name"), "sort")
    .where("type", "P")
  const nodes = new Map(rows.map((row) => [Number(row.id), { ...row, id: Number(row.id) }]))

  cache = { at: Date.now(), nodes }

  return nodes
}

/** The top section a group sits in (the group itself when it is a root). */
export function rootOf(nodes: Map<number, GroupNode>, id: number): number {
  let current = nodes.get(id)
  let guard = 0

  while (current?.parent_id != null && nodes.has(current.parent_id) && guard++ < 20) {
    current = nodes.get(current.parent_id)
  }

  return current?.id ?? id
}

/** The group and every group below it. */
export function subtreeOf(nodes: Map<number, GroupNode>, id: number): number[] {
  const children = new Map<number, number[]>()

  for (const node of nodes.values()) {
    if (node.parent_id != null) {
      children.set(node.parent_id, [...(children.get(node.parent_id) ?? []), node.id])
    }
  }

  const found: number[] = []
  const stack = [id]

  while (stack.length) {
    const next = stack.pop()!

    found.push(next)
    stack.push(...(children.get(next) ?? []))
  }

  return found
}

/**
 * The kind of each part in Ukrainian ("Гальмівний диск"), from its TecDoc
 * product type; parts without a known type are absent from the map.
 */
export async function partTypes(
  db: ParsersDb,
  partIds: (string | number)[]
): Promise<Map<string, string>> {
  const types = new Map<string, string>()

  if (!partIds.length) {
    return types
  }

  const rows: { part_id: string; name: string }[] = await db("part_group as g")
    .join("tecdoc_generic as t", "t.id", "g.generic_id")
    .select("g.part_id", db.raw("coalesce(t.name_uk, t.name) as name"))
    .whereIn("g.part_id", partIds)
    .orderBy(["g.part_id", "g.generic_id"])

  for (const row of rows) {
    const id = String(row.part_id)

    if (!types.has(id) && row.name) {
      types.set(id, row.name)
    }
  }

  return types
}

// TecDoc files motorcycles among passenger vehicles (type P, body
// "Motorcycle"); the shop sells car parts, so they are left out of the tree.
export const MOTORCYCLE = "Motorcycle"
