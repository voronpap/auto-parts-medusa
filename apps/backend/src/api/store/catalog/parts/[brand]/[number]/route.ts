import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { isVideoLink, partMedia } from "../../../../../../lib/catalog-media"
import { shopProductsByNumber } from "../../../../../../lib/catalog-shop"
import { partTypes } from "../../../../../../lib/tecdoc-groups"
import {
  brandKey,
  numberNorm,
  parsersDb,
  SUBSTITUTE_KINDS,
} from "../../../../../../lib/parsers-db"

const MAX_CROSSES = 600
const MAX_APPLICATIONS = 5000
const MAX_ENGINES = 14

type PartRow = {
  id: string
  source_key: string
  brand: string
  number: string
  title: string | null
  description: string | null
  category: string | null
  url: string | null
  status: string
  fetched_at: string
}

type CrossOut = {
  brand: string
  number: string
  number_norm: string
  title: string | null
  product: { handle: string; title: string } | null
}

type ModelFitment = {
  model: string
  year_from: number | null
  year_to: number | null
  engines: string[]
  more_engines: number
}

/**
 * One number of one brand as the parsers' catalogue knows it, merged over
 * every source that read it: names, photos, characteristics, crosses in both
 * directions and the vehicles it fits.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const db = parsersDb()

  if (!db) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Catalogue is not connected")
  }

  const brand = brandKey(decodeURIComponent(req.params.brand))
  const norm = numberNorm(decodeURIComponent(req.params.number))

  if (!brand || !norm) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Part not found")
  }

  const parts = ((await db("part")
    .select(
      "id",
      "source_key",
      "brand",
      "number",
      "title",
      "description",
      "category",
      "url",
      "status",
      "fetched_at"
    )
    .where("number_norm", norm)
    .whereNot("status", "absent")
    .orderBy("fetched_at", "desc")) as PartRow[]).filter(
    (part) => brandKey(part.brand) === brand
  )
  const ids = parts.map((part) => part.id)

  // Parts that name this number as their cross: analogues, the part that
  // replaces it and the one it replaces. The cross row names our brand.
  const naming: (CrossOut & { kind: string; cross_brand: string })[] = await db(
    "part_cross as c"
  )
    .join("part as p", "p.id", "c.part_id")
    .select(
      "c.kind",
      "c.brand as cross_brand",
      "p.brand",
      "p.number",
      "p.number_norm",
      "p.title"
    )
    .where("c.number_norm", norm)
    .whereIn("c.kind", [...SUBSTITUTE_KINDS])
    .whereNot("p.status", "absent")
    .limit(MAX_CROSSES)
  const namingUs = naming.filter(
    (row) => row.kind === "oe" || brandKey(row.cross_brand) === brand
  )

  if (!parts.length && !namingUs.length) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Part not found")
  }

  const [stated, attributes, applications] = ids.length
    ? await Promise.all([
        db("part_cross")
          .select("kind", "brand", "number", "number_norm")
          .whereIn("part_id", ids)
          .whereIn("kind", [...SUBSTITUTE_KINDS])
          .limit(MAX_CROSSES) as Promise<
          { kind: string; brand: string; number: string; number_norm: string }[]
        >,
        db("part_attribute")
          .select("grp", "name", "value")
          .whereIn("part_id", ids)
          .orderBy(["part_id", "position"])
          .limit(400) as Promise<{ grp: string | null; name: string; value: string }[]>,
        db("part_application")
          .select(
            "make",
            "model",
            "variant",
            "year_from",
            "year_to",
            "engine",
            "engine_code",
            "kw_from",
            "fuel"
          )
          .whereIn("part_id", ids)
          .orderBy(["make", "model", "year_from"])
          .limit(MAX_APPLICATIONS) as Promise<
          {
            make: string | null
            model: string | null
            variant: string | null
            year_from: number | null
            year_to: number | null
            engine: string | null
            engine_code: string | null
            kw_from: string | null
            fuel: string | null
          }[]
        >,
      ])
    : [[], [], []]

  // Crosses split the way a buyer reads them.
  const oe = new Map<string, CrossOut>()
  const analogs = new Map<string, CrossOut>()
  const newer = new Map<string, CrossOut>()
  const older = new Map<string, CrossOut>()
  const put = (
    into: Map<string, CrossOut>,
    row: { brand: string; number: string; number_norm: string; title?: string | null }
  ) => {
    if (!row.number_norm || row.brand === "?") {
      return
    }

    const id = `${brandKey(row.brand)}|${row.number_norm}`

    if (id === `${brand}|${norm}`) {
      return
    }

    const known = into.get(id)

    if (known) {
      known.title ||= row.title ?? null
      return
    }

    into.set(id, {
      brand: row.brand,
      number: row.number,
      number_norm: row.number_norm,
      title: row.title ?? null,
      product: null,
    })
  }

  for (const row of stated) {
    put(
      row.kind === "oe"
        ? oe
        : row.kind === "replaced_by"
          ? newer
          : row.kind === "replaces"
            ? older
            : analogs,
      row
    )
  }

  for (const row of namingUs) {
    put(
      row.kind === "replaced_by" ? older : row.kind === "replaces" ? newer : analogs,
      row
    )
  }

  const allCrosses = [...oe.values(), ...analogs.values(), ...newer.values(), ...older.values()]
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const [products, types, media] = await Promise.all([
    shopProductsByNumber(req, [
      norm,
      ...new Set(allCrosses.map((cross) => cross.number_norm)),
    ]),
    partTypes(db, ids),
    partMedia(db, ids, (message) => logger.warn(message)),
  ])

  for (const [id, cross] of [
    ...oe.entries(),
    ...analogs.entries(),
    ...newer.entries(),
    ...older.entries(),
  ]) {
    cross.product = products.get(id) ?? null
  }

  const byShopFirst = (a: CrossOut, b: CrossOut) =>
    Number(Boolean(b.product)) - Number(Boolean(a.product)) ||
    a.brand.localeCompare(b.brand) ||
    a.number.localeCompare(b.number)

  const seen = new Set<string>()
  const characteristics: { name: string; value: string }[] = []
  const documents: { name: string; url: string }[] = []

  for (const attribute of attributes) {
    const id = `${attribute.name}|${attribute.value}`

    if (!attribute.value || seen.has(id)) {
      continue
    }

    seen.add(id)

    if (attribute.grp === "Документи") {
      // Videos are shown as players, not listed as documents.
      if (/^https?:\/\//.test(attribute.value) && !isVideoLink(attribute.value)) {
        documents.push({ name: attribute.name, url: attribute.value })
      }
    } else {
      characteristics.push({ name: attribute.name, value: attribute.value })
    }
  }

  const makes = new Map<string, Map<string, ModelFitment & { all: Set<string>; open: boolean }>>()

  for (const row of applications) {
    const make = (row.make ?? "").trim()

    if (!make) {
      continue
    }

    const model = (row.model ?? "").trim()
    const models = makes.get(make) ?? new Map()
    const entry = models.get(model) ?? {
      model,
      year_from: null,
      year_to: null,
      engines: [],
      more_engines: 0,
      all: new Set<string>(),
      open: false,
    }

    if (row.year_from != null) {
      entry.year_from =
        entry.year_from == null ? row.year_from : Math.min(entry.year_from, row.year_from)
    }

    if (row.year_to == null) {
      entry.open = true
    } else {
      entry.year_to = Math.max(entry.year_to ?? 0, row.year_to)
    }

    const engine = [
      row.variant || row.engine,
      row.engine_code,
      row.kw_from ? `${Math.round(Number(row.kw_from))} кВт` : null,
    ]
      .filter(Boolean)
      .join(", ")

    if (engine) {
      entry.all.add(engine)
    }

    models.set(model, entry)
    makes.set(make, models)
  }

  const fitment = [...makes.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([make, models]) => ({
      make,
      models: [...models.values()]
        .sort((a, b) => a.model.localeCompare(b.model))
        .map(({ all, open, ...entry }) => {
          const engines = [...all]

          return {
            ...entry,
            year_to: open ? null : entry.year_to,
            engines: engines.slice(0, MAX_ENGINES),
            more_engines: Math.max(0, engines.length - MAX_ENGINES),
          }
        }),
    }))

  const named = parts.find((part) => part.title) ?? parts[0]
  const own = namingUs.find((row) => brandKey(row.cross_brand) === brand)

  return res.status(200).json({
    part: {
      brand: parts[0]?.brand ?? own?.cross_brand ?? decodeURIComponent(req.params.brand),
      number: parts[0]?.number ?? norm,
      number_norm: norm,
      title: named?.title ?? null,
      type: ids.map((id) => types.get(String(id))).find(Boolean) ?? null,
      description: parts.find((part) => part.description)?.description ?? null,
      category: parts.find((part) => part.category)?.category ?? null,
      discontinued:
        parts.length > 0 && parts.every((part) => part.status === "discontinued"),
      sources: parts.map((part) => ({
        source: part.source_key,
        url: part.url,
        status: part.status,
        fetched_at: part.fetched_at,
      })),
      images: media.images,
      spin: media.spin,
      viewers: media.viewers,
      videos: media.videos,
      characteristics,
      documents,
      oe: [...oe.values()].sort(byShopFirst),
      analogs: [...analogs.values()].sort(byShopFirst),
      newer: [...newer.values()].sort(byShopFirst),
      older: [...older.values()].sort(byShopFirst),
      fitment,
      fitment_truncated: applications.length >= MAX_APPLICATIONS,
      product: products.get(`${brand}|${norm}`) ?? null,
    },
  })
}
