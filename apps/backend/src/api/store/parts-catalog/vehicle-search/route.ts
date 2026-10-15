import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import {
  familyKey,
  familyLabel,
} from "../../../../modules/parts-catalog/utils/vehicle-family"
import {
  searchEngineCode,
  searchModels,
  VehicleMatchRow,
} from "../vehicles/queries"

const Query = z.object({
  q: z.string().trim().max(80).optional(),
  engine: z.string().trim().max(20).optional(),
})

type Match = {
  make_id: string
  make: string
  key: string
  label: string
  year_from: number | null
  year_to: number | null
  open_ended: boolean
  engine_code: string | null
  engine: string | null
}

const LIMIT = 30

/**
 * Model families the store has parts for, found by a phrase ("vw passat b6")
 * or by an engine code ("CAYC"). Each leads to the family on the cars page.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const db = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const parsed = Query.safeParse(req.query)
  const { q, engine } = parsed.success ? parsed.data : {}
  const words = (q ?? "").split(/\s+/).filter((word) => word.length > 0)
  const code = (engine ?? "").replace(/\s+/g, "")
  let rows: VehicleMatchRow[] = []

  if (code.length >= 3) {
    rows = await searchEngineCode(db, code)
  } else if (words.join("").length >= 2) {
    rows = await searchModels(db, words.slice(0, 5))
  }

  const matches = new Map<string, Match>()

  for (const row of rows) {
    const key = familyKey(row.name)

    if (!key) {
      continue
    }

    const id = `${row.make_id}|${key}|${row.engine_code ?? ""}`
    const entry: Match = matches.get(id) ?? {
      make_id: row.make_id,
      make: row.make,
      key,
      label: familyLabel(key),
      year_from: null,
      year_to: null,
      open_ended: false,
      engine_code: row.engine_code,
      engine: row.engine,
    }

    if (row.year_from != null) {
      entry.year_from = Math.min(entry.year_from ?? row.year_from, row.year_from)
    }

    if (row.year_to != null) {
      entry.year_to = Math.max(entry.year_to ?? 0, row.year_to)
    }

    entry.open_ended ||= row.open_ended
    matches.set(id, entry)
  }

  return res.status(200).json({
    vehicles: [...matches.values()].slice(0, LIMIT).map(({ open_ended, ...match }) => ({
      ...match,
      year_to: open_ended ? null : match.year_to,
    })),
  })
}
