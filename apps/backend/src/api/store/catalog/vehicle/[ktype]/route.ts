import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { shopProductsByNumber } from "../../../../../lib/catalog-shop"
import { brandKey, parsersDb } from "../../../../../lib/parsers-db"
import {
  groupTree,
  partTypes,
  rootOf,
  SERVICE_ROOTS,
  subtreeOf,
} from "../../../../../lib/tecdoc-groups"

const Query = z.object({
  // A TecDoc group (a section or one of its groups); 0 is "other", the parts
  // that have no group yet.
  group: z.coerce.number().int().min(0).optional(),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
})

const PAGE_SIZE = 60
const OTHER = 0

type Section = {
  id: number
  name: string
  parts: number
  groups: { id: number; name: string; parts: number }[]
}

/**
 * A TecDoc vehicle version (KType) and the parts the catalogue lists for it:
 * the TecDoc sections and groups those parts fall into, in Ukrainian, or one
 * group's parts page by page.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const db = parsersDb()
  const ktype = Number(req.params.ktype)
  const parsed = Query.safeParse(req.query)

  if (!db || !Number.isInteger(ktype) || !parsed.success) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Vehicle not found")
  }

  const [vehicle] = await db("tecdoc_vehicle")
    .select(
      "id",
      "make_id",
      "model_id",
      "make",
      "model",
      "description",
      "year_from",
      "month_from",
      "year_to",
      "month_to",
      "kw_from",
      "hp_from",
      "capacity_ccm",
      "fuel",
      "body",
      "drive",
      "engine_codes"
    )
    .where({ type: "P", id: ktype })

  if (!vehicle) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Vehicle not found")
  }

  const nodes = await groupTree(db)
  const ref = `KType ${ktype}`

  if (parsed.data.group === undefined) {
    // Every part fitted to the vehicle with the groups it belongs to.
    const rows: { part_id: string; group_id: number | null }[] = await db(
      "part_application as a"
    )
      .join("part as p", "p.id", "a.part_id")
      .leftJoin("part_group as g", function () {
        this.on("g.part_id", "a.part_id").andOnNotNull("g.group_id")
      })
      .distinct("a.part_id", "g.group_id")
      .where("a.vehicle_ref", ref)
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

    return res.status(200).json({
      vehicle,
      total: byPart.size,
      sections,
      other,
    })
  }

  const group = parsed.data.group
  const label =
    group === OTHER ? "Інше" : nodes.get(group)?.name

  if (!label) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Group not found")
  }

  const inGroup = db("part_group")
    .select("part_id")
    .whereIn("group_id", group === OTHER ? [] : subtreeOf(nodes, group))
  const query = db("part_application as a")
    .join("part as p", "p.id", "a.part_id")
    .where("a.vehicle_ref", ref)
    .whereNot("p.status", "absent")

  if (group === OTHER) {
    query.whereNotExists(
      db("part_group as g")
        .select(db.raw("1"))
        .whereRaw("g.part_id = a.part_id")
        .whereNotNull("g.group_id")
    )
  } else {
    query.whereIn("a.part_id", inGroup)
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
    .offset(parsed.data.offset)
    .limit(PAGE_SIZE + 1)

  const page = rows.slice(0, PAGE_SIZE)
  const [products, types] = await Promise.all([
    shopProductsByNumber(req, [...new Set(page.map((row) => row.number_norm))]),
    partTypes(db, page.map((row) => row.id)),
  ])
  const section = group === OTHER ? null : rootOf(nodes, group)

  return res.status(200).json({
    vehicle,
    group,
    label,
    section:
      section != null && section !== group
        ? { id: section, name: nodes.get(section)?.name ?? "" }
        : null,
    offset: parsed.data.offset,
    more: rows.length > PAGE_SIZE,
    parts: page.map(({ id, ...row }) => ({
      ...row,
      type: types.get(String(id)) ?? null,
      // Fitting notes such as axle or gearbox; the vehicle's own data that
      // older TecDoc reads put here is not a condition, so it is left out.
      conditions:
        row.conditions && !/^циліндрів/.test(row.conditions)
          ? row.conditions
          : null,
      product: products.get(`${brandKey(row.brand)}|${row.number_norm}`) ?? null,
    })),
  })
}
