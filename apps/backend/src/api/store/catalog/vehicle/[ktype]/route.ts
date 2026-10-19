import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { shopProductsByNumber } from "../../../../../lib/catalog-shop"
import { brandKey, parsersDb } from "../../../../../lib/parsers-db"

const Query = z.object({
  category: z.string().trim().max(200).optional(),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
})

const PAGE_SIZE = 60
const OTHER = "Інше"

/**
 * A TecDoc vehicle version (KType) and the parts the catalogue lists for it:
 * categories with counts, or one category's parts page by page. A category is
 * the source's own wording, so the same kind of part may sit under two.
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

  // Sources mostly name the category in TecDoc's English; the TecDoc group of
  // the same name gives it in Ukrainian. Others keep the source's wording.
  const labels = async (names: string[]) => {
    const rows: { key: string; name_uk: string }[] = names.length
      ? await db("tecdoc_group")
          .select(db.raw("distinct on (lower(name)) lower(name) as key"), "name_uk")
          .where("type", "P")
          .whereNotNull("name_uk")
          .whereRaw("lower(name) = any(?)", [names.map((name) => name.toLowerCase())])
          .orderByRaw("lower(name), parent_id nulls first")
      : []
    const byName = new Map(rows.map((row) => [row.key, row.name_uk]))

    return (name: string) => byName.get(name.toLowerCase()) ?? name
  }

  const category = db.raw("coalesce(nullif(trim(p.category), ''), ?)", [OTHER])
  const fitting = () =>
    db("part_application as a")
      .join("part as p", "p.id", "a.part_id")
      .where("a.vehicle_ref", `KType ${ktype}`)
      .whereNot("p.status", "absent")

  if (!parsed.data.category) {
    const groups: { category: string; parts: string }[] = await fitting()
      .select(db.raw("? as category", [category]))
      .select(db.raw("count(distinct (upper(p.brand), p.number_norm)) as parts"))
      .groupByRaw("1")
      .orderByRaw("2 desc, 1")

    const label = await labels(groups.map((group) => group.category))

    return res.status(200).json({
      vehicle,
      groups: groups.map((group) => ({
        category: group.category,
        label: label(group.category),
        parts: Number(group.parts),
      })),
    })
  }

  const rows: {
    brand: string
    number: string
    number_norm: string
    title: string | null
    conditions: string | null
  }[] = await fitting()
    .select(
      db.raw(
        "distinct on (upper(p.brand), p.number_norm) p.brand, p.number, p.number_norm, p.title, a.conditions"
      )
    )
    .whereRaw("? = ?", [category, parsed.data.category])
    .orderByRaw("upper(p.brand), p.number_norm, (p.title is null)")
    .offset(parsed.data.offset)
    .limit(PAGE_SIZE + 1)

  const page = rows.slice(0, PAGE_SIZE)
  const [products, label] = await Promise.all([
    shopProductsByNumber(req, [...new Set(page.map((row) => row.number_norm))]),
    labels([parsed.data.category]),
  ])

  return res.status(200).json({
    vehicle,
    category: parsed.data.category,
    label: label(parsed.data.category),
    offset: parsed.data.offset,
    more: rows.length > PAGE_SIZE,
    parts: page.map((row) => ({
      ...row,
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
