import type { MedusaRequest } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { shopProductsByNumber } from "./catalog-shop"
import { brandKey, type ParsersDb } from "./parsers-db"
import { groupTree, partTypes, rootOf, SERVICE_ROOTS, subtreeOf } from "./tecdoc-groups"

/**
 * Parts fitted to one or more TecDoc vehicle versions (KType), grouped the
 * TecDoc way. A whole model (or a model in one year) is several versions.
 */

export const PAGE_SIZE = 60
// Parts that have no TecDoc group yet.
export const OTHER = 0

export type Section = {
  id: number
  name: string
  parts: number
  groups: { id: number; name: string; parts: number }[]
}

const refsOf = (ktypes: number[]) => ktypes.map((ktype) => `KType ${ktype}`)

/** TecDoc sections and groups of the versions' parts, with counts. */
export async function vehicleSections(db: ParsersDb, ktypes: number[]) {
  const nodes = await groupTree(db)
  const rows: { part_id: string; group_id: number | null }[] = await db(
    "part_application as a"
  )
    .join("part as p", "p.id", "a.part_id")
    .leftJoin("part_group as g", function () {
      this.on("g.part_id", "a.part_id").andOnNotNull("g.group_id")
    })
    .distinct("a.part_id", "g.group_id")
    .whereIn("a.vehicle_ref", refsOf(ktypes))
    .whereNot("p.status", "absent")

  const byPart = new Map<string, number[]>()

  for (const row of rows) {
    const groups = byPart.get(String(row.part_id)) ?? []

    if (row.group_id != null && nodes.has(Number(row.group_id))) {
      groups.push(Number(row.group_id))
    }

    byPart.set(String(row.part_id), groups)
  }

  const sectionParts = new Map<number, Set<string>>()
  const groupParts = new Map<number, Set<string>>()
  let other = 0

  for (const [part, groups] of byPart) {
    // Service roots repeat the working sections' parts; they count only for
    // a part that has no working section.
    const working = groups.filter((id) => !SERVICE_ROOTS.has(rootOf(nodes, id)))
    const shown = working.length ? working : groups

    if (!shown.length) {
      other++
      continue
    }

    for (const id of shown) {
      const root = rootOf(nodes, id)

      sectionParts.set(root, (sectionParts.get(root) ?? new Set()).add(part))
      groupParts.set(id, (groupParts.get(id) ?? new Set()).add(part))
    }
  }

  const sections: Section[] = [...sectionParts.entries()]
    .map(([id, parts]) => ({
      id,
      name: nodes.get(id)?.name ?? String(id),
      parts: parts.size,
      groups: [...groupParts.entries()]
        .filter(([group]) => group !== id && rootOf(nodes, group) === id)
        .map(([group, groupSet]) => ({
          id: group,
          name: nodes.get(group)?.name ?? String(group),
          parts: groupSet.size,
        }))
        .sort((a, b) => b.parts - a.parts || a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => b.parts - a.parts || a.name.localeCompare(b.name))

  return { total: byPart.size, sections, other }
}

/** One page of the versions' parts in a group or section (OTHER: no group). */
export async function vehicleGroupParts(
  req: MedusaRequest,
  db: ParsersDb,
  ktypes: number[],
  group: number,
  offset: number
) {
  const nodes = await groupTree(db)
  const label = group === OTHER ? "Інше" : nodes.get(group)?.name

  if (!label) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Group not found")
  }

  const query = db("part_application as a")
    .join("part as p", "p.id", "a.part_id")
    .whereIn("a.vehicle_ref", refsOf(ktypes))
    .whereNot("p.status", "absent")

  if (group === OTHER) {
    query.whereNotExists(
      db("part_group as g")
        .select(db.raw("1"))
        .whereRaw("g.part_id = a.part_id")
        .whereNotNull("g.group_id")
    )
  } else {
    query.whereIn(
      "a.part_id",
      db("part_group").select("part_id").whereIn("group_id", subtreeOf(nodes, group))
    )
  }

  const rows: {
    id: string
    brand: string
    number: string
    number_norm: string
    title: string | null
    conditions: string | null
  }[] = await query
    .select(
      db.raw(
        "distinct on (upper(p.brand), p.number_norm) p.id, p.brand, p.number, p.number_norm, p.title, a.conditions"
      )
    )
    .orderByRaw("upper(p.brand), p.number_norm, (p.title is null)")
    .offset(offset)
    .limit(PAGE_SIZE + 1)

  const page = rows.slice(0, PAGE_SIZE)
  const [products, types] = await Promise.all([
    shopProductsByNumber(req, [...new Set(page.map((row) => row.number_norm))]),
    partTypes(db, page.map((row) => row.id)),
  ])
  const section = group === OTHER ? null : rootOf(nodes, group)

  return {
    group,
    label,
    section:
      section != null && section !== group
        ? { id: section, name: nodes.get(section)?.name ?? "" }
        : null,
    offset,
    more: rows.length > PAGE_SIZE,
    parts: page.map(({ id, ...row }) => ({
      ...row,
      type: types.get(String(id)) ?? null,
      // Fitting notes such as axle or gearbox; the vehicle's own data that
      // older TecDoc reads put here is not a condition, so it is left out.
      conditions:
        row.conditions && !/^циліндрів/.test(row.conditions) ? row.conditions : null,
      product: products.get(`${brandKey(row.brand)}|${row.number_norm}`) ?? null,
    })),
  }
}
