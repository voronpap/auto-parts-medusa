import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { catalogImagePath } from "../../../../lib/catalog-images"
import { shopProductsByNumber } from "../../../../lib/catalog-shop"
import {
  brandKey,
  numberNorm,
  parsersDb,
  SUBSTITUTE_KINDS,
} from "../../../../lib/parsers-db"

const Query = z.object({ q: z.string().trim().min(1).max(60) })

const MIN_KEY_LENGTH = 3
const MAX_ROWS = 400
const MAX_RESULTS = 150

/**
 * How a found number relates to the one typed: the number itself, an
 * analogue (either side names the other), the original (OE) number, a newer
 * part that replaces it, or an older one it replaces.
 */
type Relation = "number" | "analog" | "oe" | "newer" | "older"

type PartRow = {
  id: string
  source_key: string
  brand: string
  number: string
  number_norm: string
  title: string | null
  category: string | null
  status: string
}

type Found = {
  brand: string
  number: string
  number_norm: string
  title: string | null
  category: string | null
  discontinued: boolean
  image: string | null
  relation: Relation
  sources: string[]
  product: { handle: string; title: string } | null
  partIds: string[]
}

const RELATION_ORDER: Record<Relation, number> = {
  number: 0,
  newer: 1,
  analog: 2,
  oe: 3,
  older: 4,
}

/**
 * Searches the parsers' catalogue by part number: the number in every source,
 * the parts that name it as their cross, and the crosses those parts state.
 * Answers with numbers grouped by brand, each with a photo and the shop
 * product selling it, if any.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const parsed = Query.safeParse(req.query)

  if (!parsed.success) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "q is required")
  }

  const db = parsersDb()
  const key = numberNorm(parsed.data.q)

  if (!db || key.length < MIN_KEY_LENGTH || !/\d/.test(key)) {
    return res.status(200).json({ query: key, parts: [] })
  }

  const columns = [
    "p.id",
    "p.source_key",
    "p.brand",
    "p.number",
    "p.number_norm",
    "p.title",
    "p.category",
    "p.status",
  ]
  const [direct, naming] = await Promise.all([
    db("part as p")
      .select(columns)
      .where("p.number_norm", key)
      .whereNot("p.status", "absent")
      .limit(MAX_ROWS) as Promise<PartRow[]>,
    // Parts that state the typed number as one of their crosses.
    db("part_cross as c")
      .join("part as p", "p.id", "c.part_id")
      .select([...columns, "c.kind"])
      .where("c.number_norm", key)
      .whereIn("c.kind", [...SUBSTITUTE_KINDS])
      .whereNot("p.status", "absent")
      .limit(MAX_ROWS) as Promise<(PartRow & { kind: string })[]>,
  ])
  // Crosses the typed number's own parts state.
  const stated: { kind: string; brand: string; number: string; number_norm: string }[] =
    direct.length
      ? await db("part_cross")
          .select("kind", "brand", "number", "number_norm")
          .whereIn(
            "part_id",
            direct.map((row) => row.id)
          )
          .whereIn("kind", [...SUBSTITUTE_KINDS])
          .whereNot("number_norm", key)
          .limit(MAX_ROWS)
      : []

  const found = new Map<string, Found>()
  const add = (
    brand: string,
    number: string,
    norm: string,
    relation: Relation,
    part?: PartRow
  ) => {
    if (!norm || brand === "?") {
      return
    }

    const id = `${brandKey(brand)}|${norm}`
    const entry =
      found.get(id) ??
      ({
        brand,
        number,
        number_norm: norm,
        title: null,
        category: null,
        discontinued: false,
        image: null,
        relation,
        sources: [],
        product: null,
        partIds: [],
      } as Found)

    if (RELATION_ORDER[relation] < RELATION_ORDER[entry.relation]) {
      entry.relation = relation
    }

    if (part) {
      entry.title ||= part.title || null
      entry.category ||= part.category || null
      entry.discontinued ||= part.status === "discontinued"

      if (!entry.sources.includes(part.source_key)) {
        entry.sources.push(part.source_key)
      }

      if (!entry.partIds.includes(part.id)) {
        entry.partIds.push(part.id)
      }
    }

    found.set(id, entry)
  }

  for (const part of direct) {
    add(part.brand, part.number, part.number_norm, "number", part)
  }

  for (const part of naming) {
    // The part names the typed number as its replacement or as the part it
    // replaces; any other kind makes the two interchangeable.
    const relation: Relation =
      part.kind === "replaced_by"
        ? "older"
        : part.kind === "replaces"
          ? "newer"
          : "analog"

    add(part.brand, part.number, part.number_norm, relation, part)
  }

  for (const cross of stated) {
    const relation: Relation =
      cross.kind === "oe"
        ? "oe"
        : cross.kind === "replaced_by"
          ? "newer"
          : cross.kind === "replaces"
            ? "older"
            : "analog"

    add(cross.brand, cross.number, cross.number_norm, relation)
  }

  // Stated crosses known only by number get their names from the catalogue.
  const unnamed = [...found.values()].filter((entry) => !entry.partIds.length)

  if (unnamed.length) {
    const rows: PartRow[] = await db("part as p")
      .select(columns)
      .whereIn(
        "p.number_norm",
        [...new Set(unnamed.map((entry) => entry.number_norm))]
      )
      .whereNot("p.status", "absent")
      .limit(MAX_ROWS * 2)

    for (const row of rows) {
      const entry = found.get(`${brandKey(row.brand)}|${row.number_norm}`)

      if (entry) {
        add(row.brand, entry.number, row.number_norm, entry.relation, row)
      }
    }
  }

  const list = [...found.values()]
    .sort(
      (a, b) =>
        RELATION_ORDER[a.relation] - RELATION_ORDER[b.relation] ||
        Number(Boolean(b.title)) - Number(Boolean(a.title)) ||
        a.brand.localeCompare(b.brand) ||
        a.number.localeCompare(b.number)
    )
    .slice(0, MAX_RESULTS)

  const partIds = list.flatMap((entry) => entry.partIds)
  const [images, products] = await Promise.all([
    partIds.length
      ? (db("part_image")
          .distinctOn("part_id")
          .select("part_id", "id")
          .whereIn("part_id", partIds)
          .orderBy("part_id")
          .orderByRaw("(kind = 'photo') desc, position") as Promise<
          { part_id: string; id: string }[]
        >)
      : Promise.resolve([]),
    shopProductsByNumber(req, [
      ...new Set(list.map((entry) => entry.number_norm)),
    ]),
  ])
  const imageByPart = new Map(
    images.map((row) => [String(row.part_id), catalogImagePath(row.id)])
  )

  return res.status(200).json({
    query: key,
    parts: list.map(({ partIds, ...entry }) => ({
      ...entry,
      image:
        partIds.map((id) => imageByPart.get(String(id))).find(Boolean) ?? null,
      product:
        products.get(`${brandKey(entry.brand)}|${entry.number_norm}`) ?? null,
    })),
  })
}
