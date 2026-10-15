// The part of the database connection these queries use.
type Knex = {
  raw: (sql: string, bindings?: unknown[]) => Promise<{ rows: any[] }>
}

// These lists count over every fitment row of every product, across the
// product and catalog tables, so they are single read-only SQL statements
// rather than module calls that would load the rows into memory.

// Fitment rows shoppers may see, of part numbers a published product carries.
const FITTING = `
  from part_application a
  join product_product_variant_partscatalog_part_number l
    on l.part_number_id = a.part_number_id and l.deleted_at is null
  join product_variant pv on pv.id = l.product_variant_id and pv.deleted_at is null
  join product p on p.id = pv.product_id and p.deleted_at is null and p.status = 'published'
  where a.deleted_at is null and a.applicability_verdict in ('ACCEPTED', 'CONDITIONAL')
`

export type MakeRow = { id: string; name: string; products: number }
export type ModelRow = {
  id: string
  name: string
  year_from: number | null
  year_to: number | null
  open_ended: boolean
  products: number
}

export async function listMakes(db: Knex): Promise<MakeRow[]> {
  const { rows } = await db.raw(
    `select m.id, m.name, count(distinct p.id)::int as products
     ${FITTING} and a.vehicle_make_id is not null
     group by m.id, m.name order by m.name`.replace(
      "from part_application a",
      "from part_application a join vehicle_make m on m.id = a.vehicle_make_id and m.deleted_at is null"
    )
  )

  return rows
}

export async function listModels(db: Knex, makeId: string): Promise<ModelRow[]> {
  const { rows } = await db.raw(
    `select vm.id, vm.name, min(a.year_from)::int as year_from, max(a.year_to)::int as year_to,
            bool_or(a.year_to is null) as open_ended, count(distinct p.id)::int as products
     ${FITTING} and a.vehicle_make_id = ?
     group by vm.id, vm.name order by vm.name`.replace(
      "from part_application a",
      "from part_application a join vehicle_model vm on vm.id = a.vehicle_model_id and vm.deleted_at is null"
    ),
    [makeId]
  )

  return rows
}

export async function listProductIds(
  db: Knex,
  makeId: string,
  modelIds: string[],
  year: number | null
): Promise<string[]> {
  if (!modelIds.length) {
    return []
  }

  const { rows } = await db.raw(
    `select distinct p.id
     ${FITTING} and a.vehicle_make_id = ?
       and a.vehicle_model_id in (${modelIds.map(() => "?").join(", ")})
       ${year ? "and (a.year_from is null or a.year_from <= ?) and (a.year_to is null or a.year_to >= ?)" : ""}`,
    [makeId, ...modelIds, ...(year ? [year, year] : [])]
  )

  return rows.map((row: { id: string }) => row.id)
}

export type VehicleMatchRow = {
  make_id: string
  make: string
  name: string
  engine_code: string | null
  engine: string | null
  year_from: number | null
  year_to: number | null
  open_ended: boolean
}

// Typed text is matched literally: % and _ are not wildcards.
const escapeLike = (text: string) => text.replace(/[\\%_]/g, "\\$&")

const WITH_MODEL =
  "from part_application a join vehicle_make m on m.id = a.vehicle_make_id and m.deleted_at is null join vehicle_model vm on vm.id = a.vehicle_model_id and vm.deleted_at is null"

/** Models whose make (or a make alias) and name contain every word typed. */
export async function searchModels(
  db: Knex,
  words: string[]
): Promise<VehicleMatchRow[]> {
  const { rows } = await db.raw(
    `select m.id as make_id, m.name as make, vm.name, null as engine_code, null as engine,
            min(a.year_from)::int as year_from, max(a.year_to)::int as year_to,
            bool_or(a.year_to is null) as open_ended
     ${FITTING}
       and (m.name || ' ' || vm.name || ' ' || coalesce((
         select string_agg(x.alias, ' ') from vehicle_make_alias x
         where x.make_id = m.id and x.deleted_at is null), '')) ilike all (array[${words.map(() => "?").join(", ")}])
     group by m.id, m.name, vm.name order by m.name, vm.name limit 200`.replace(
      "from part_application a",
      WITH_MODEL
    ),
    words.map((word) => `%${escapeLike(word)}%`)
  )

  return rows
}

/** Models with an engine whose code starts with what was typed. */
export async function searchEngineCode(
  db: Knex,
  code: string
): Promise<VehicleMatchRow[]> {
  const { rows } = await db.raw(
    `select m.id as make_id, m.name as make, vm.name, upper(a.engine_code) as engine_code,
            min(a.engine) as engine, min(a.year_from)::int as year_from,
            max(a.year_to)::int as year_to, bool_or(a.year_to is null) as open_ended
     ${FITTING} and upper(a.engine_code) like ?
     group by m.id, m.name, vm.name, upper(a.engine_code)
     order by upper(a.engine_code), m.name, vm.name limit 200`.replace(
      "from part_application a",
      WITH_MODEL
    ),
    [`${escapeLike(code.toUpperCase())}%`]
  )

  return rows
}
