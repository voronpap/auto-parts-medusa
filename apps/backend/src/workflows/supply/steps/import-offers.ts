import { MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { PARTS_CATALOG_MODULE } from "../../../modules/parts-catalog"
import PartsCatalogModuleService from "../../../modules/parts-catalog/service"
import {
  formatDisplayNumber,
  normalizeBrandName,
  normalizePartNumber,
} from "../../../modules/parts-catalog/utils/normalize"
import { SUPPLY_MODULE } from "../../../modules/supply"
import SupplyModuleService from "../../../modules/supply/service"
import { parsePriceToMinor, parseStock } from "../../../modules/supply/utils/price"

const MAX_ERRORS = 50

export type OfferRow = {
  brand: string
  number: string
  title?: string | null
  // As the price list writes it; parsed here so every importer agrees.
  price: string | number
  stock?: string | number | null
  lead_days?: number | null
}

export type OpenImportRunInput = { supplier_id: string; file_name?: string | null }
export type ImportOfferRowsInput = { run_id: string; rows: OfferRow[] }
export type FinishImportRunInput = { run_id: string }

type RunCounters = {
  rows_total: number
  rows_skipped: number
  offers_created: number
  offers_updated: number
  offers_unchanged: number
  offers_matched: number
  errors: Record<string, unknown> | null
}

type OfferSnapshot = {
  id: string
  title: string | null
  price_minor: number
  currency_code: string
  stock_quantity: number | null
  stock_text: string | null
  lead_days: number | null
  is_listed: boolean
  part_number_id: string | null
  last_run_id: string | null
  last_seen_at: Date
}

type RowsUndo = {
  run_id: string
  counters: RunCounters
  created_offer_ids: string[]
  updated: OfferSnapshot[]
  observation_ids: string[]
}

const resolveSupply = (container: { resolve: <T>(key: string) => T }) =>
  container.resolve<SupplyModuleService>(SUPPLY_MODULE)

export const openImportRunStep = createStep(
  "open-supply-import-run",
  async (input: OpenImportRunInput, { container }) => {
    const supply = resolveSupply(container)
    const supplier = await supply.retrieveSupplier(input.supplier_id)
    const [open] = await supply.listImportRuns({
      supplier_id: supplier.id,
      status: "open",
    })

    // Two lists loading at once would take each other's rows off the shelf.
    if (open) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Price list "${open.file_name ?? open.id}" of this supplier is still loading; finish it first`
      )
    }

    const run = await supply.createImportRuns({
      supplier_id: supplier.id,
      file_name: input.file_name?.trim() || null,
    })

    return new StepResponse(run, run.id)
  },
  async (runId: string | undefined, { container }) => {
    if (runId) {
      await resolveSupply(container).deleteImportRuns(runId)
    }
  }
)

/**
 * Loads a part of a price list. A row becomes a new offer or updates the one
 * the supplier already has for that brand and number; history gets a row only
 * when price, stock or listing changed.
 */
export const importOfferRowsStep = createStep(
  "import-supply-offer-rows",
  async (input: ImportOfferRowsInput, { container }) => {
    const supply = resolveSupply(container)
    const catalog = container.resolve<PartsCatalogModuleService>(
      PARTS_CATALOG_MODULE
    )
    const run = await supply.retrieveImportRun(input.run_id, {
      relations: ["supplier"],
    })

    if (run.status !== "open") {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "This price list is already finished"
      )
    }

    const now = new Date()
    const currency = run.supplier.currency_code
    const undo: RowsUndo = {
      run_id: run.id,
      counters: {
        rows_total: run.rows_total,
        rows_skipped: run.rows_skipped,
        offers_created: run.offers_created,
        offers_updated: run.offers_updated,
        offers_unchanged: run.offers_unchanged,
        offers_matched: run.offers_matched,
        errors: run.errors,
      },
      created_offer_ids: [],
      updated: [],
      observation_ids: [],
    }
    const errors: { brand: string; number: string; reason: string }[] = [
      ...(((run.errors as { items?: unknown[] } | null)?.items ?? []) as {
        brand: string
        number: string
        reason: string
      }[]),
    ]
    const counters = { ...undo.counters }

    // Rows read from the list; the last one wins when a number repeats.
    const rows = new Map<
      string,
      {
        brand: string
        number: string
        normalized_brand: string
        normalized_number: string
        title: string | null
        price_minor: number
        stock_quantity: number | null
        stock_text: string | null
        lead_days: number | null
      }
    >()

    for (const row of input.rows) {
      counters.rows_total += 1
      const brand = String(row.brand ?? "").trim()
      const number = formatDisplayNumber(String(row.number ?? ""))
      const normalizedBrand = normalizeBrandName(brand)
      const normalizedNumber = normalizePartNumber(number)
      const price = parsePriceToMinor(row.price)
      const reason = !normalizedBrand
        ? "немає бренду"
        : !normalizedNumber
          ? "немає номера"
          : price == null
            ? "ціна не є додатним числом"
            : price > 2_000_000_000
              ? "ціна завелика"
              : null

      if (reason) {
        counters.rows_skipped += 1

        if (errors.length < MAX_ERRORS) {
          errors.push({ brand, number, reason })
        }

        continue
      }

      const stock = parseStock(row.stock)

      rows.set(`${normalizedBrand}|${normalizedNumber}`, {
        brand,
        number,
        normalized_brand: normalizedBrand,
        normalized_number: normalizedNumber,
        title: row.title ? String(row.title).trim().slice(0, 500) || null : null,
        price_minor: price!,
        stock_quantity: stock.quantity,
        stock_text: stock.text,
        lead_days:
          typeof row.lead_days === "number" && row.lead_days >= 0
            ? Math.floor(row.lead_days)
            : null,
      })
    }

    const list = [...rows.values()]
    const numbers = [...new Set(list.map((row) => row.normalized_number))]
    const existing = numbers.length
      ? await supply.listSupplierOffers(
          { supplier_id: run.supplier.id, normalized_number: numbers },
          { take: null }
        )
      : []
    const existingByKey = new Map(
      existing.map((offer) => [
        `${offer.normalized_brand}|${offer.normalized_number}`,
        offer,
      ])
    )

    // Numbers the parts catalog knows, by brand name or alias.
    const brandKeys = [...new Set(list.map((row) => row.normalized_brand))]
    const [brands, aliases] = brandKeys.length
      ? await Promise.all([
          catalog.listBrands(
            { normalized_name: brandKeys },
            { select: ["id", "normalized_name"], take: null }
          ),
          catalog.listBrandAliasRecords(
            { normalized_alias: brandKeys },
            { select: ["brand_id", "normalized_alias"], take: null }
          ),
        ])
      : [[], []]
    const brandIdByKey = new Map<string, string>([
      ...aliases.map((alias) => [alias.normalized_alias, alias.brand_id] as [string, string]),
      ...brands.map((brand) => [brand.normalized_name, brand.id] as [string, string]),
    ])
    const catalogNumbers = numbers.length
      ? await catalog.listPartNumbers(
          {
            brand_id: [...new Set(brandIdByKey.values())],
            normalized_number: numbers,
          },
          { select: ["id", "brand_id", "normalized_number"], take: null }
        )
      : []
    const partNumberId = new Map(
      catalogNumbers.map((number) => [
        `${number.brand_id}|${number.normalized_number}`,
        number.id,
      ])
    )

    try {
      for (const row of list) {
        const key = `${row.normalized_brand}|${row.normalized_number}`
        const brandId = brandIdByKey.get(row.normalized_brand)
        const matched = brandId
          ? partNumberId.get(`${brandId}|${row.normalized_number}`) ?? null
          : null

        if (matched) {
          counters.offers_matched += 1
        }

        const offer = existingByKey.get(key)

        if (!offer) {
          const created = await supply.createSupplierOffers({
            supplier_id: run.supplier.id,
            brand: row.brand,
            number: row.number,
            normalized_brand: row.normalized_brand,
            normalized_number: row.normalized_number,
            part_number_id: matched,
            title: row.title,
            price_minor: row.price_minor,
            currency_code: currency,
            stock_quantity: row.stock_quantity,
            stock_text: row.stock_text,
            lead_days: row.lead_days,
            is_listed: true,
            last_run_id: run.id,
            last_seen_at: now,
          })
          undo.created_offer_ids.push(created.id)
          const observation = await supply.createOfferObservations({
            offer_id: created.id,
            price_minor: row.price_minor,
            currency_code: currency,
            stock_quantity: row.stock_quantity,
            is_listed: true,
            run_id: run.id,
            observed_at: now,
          })
          undo.observation_ids.push(observation.id)
          counters.offers_created += 1
          continue
        }

        const changed =
          offer.price_minor !== row.price_minor ||
          offer.currency_code !== currency ||
          offer.stock_quantity !== row.stock_quantity ||
          !offer.is_listed

        undo.updated.push({
          id: offer.id,
          title: offer.title,
          price_minor: offer.price_minor,
          currency_code: offer.currency_code,
          stock_quantity: offer.stock_quantity,
          stock_text: offer.stock_text,
          lead_days: offer.lead_days,
          is_listed: offer.is_listed,
          part_number_id: offer.part_number_id,
          last_run_id: offer.last_run_id,
          last_seen_at: offer.last_seen_at,
        })
        await supply.updateSupplierOffers({
          id: offer.id,
          title: row.title ?? offer.title,
          price_minor: row.price_minor,
          currency_code: currency,
          stock_quantity: row.stock_quantity,
          stock_text: row.stock_text,
          lead_days: row.lead_days,
          is_listed: true,
          part_number_id: matched ?? offer.part_number_id,
          last_run_id: run.id,
          last_seen_at: now,
        })

        if (changed) {
          const observation = await supply.createOfferObservations({
            offer_id: offer.id,
            price_minor: row.price_minor,
            currency_code: currency,
            stock_quantity: row.stock_quantity,
            is_listed: true,
            run_id: run.id,
            observed_at: now,
          })
          undo.observation_ids.push(observation.id)
          counters.offers_updated += 1
        } else {
          counters.offers_unchanged += 1
        }
      }

      await supply.updateImportRuns({
        id: run.id,
        ...counters,
        errors: errors.length ? { items: errors } : null,
      })
    } catch (error) {
      await undoRows(supply, undo)
      throw error
    }

    return new StepResponse(
      {
        run_id: run.id,
        rows: input.rows.length,
        created: counters.offers_created - undo.counters.offers_created,
        updated: counters.offers_updated - undo.counters.offers_updated,
        unchanged: counters.offers_unchanged - undo.counters.offers_unchanged,
        skipped: counters.rows_skipped - undo.counters.rows_skipped,
        matched: counters.offers_matched - undo.counters.offers_matched,
      },
      undo
    )
  },
  async (undo: RowsUndo | undefined, { container }) => {
    if (undo) {
      await undoRows(resolveSupply(container), undo)
    }
  }
)

async function undoRows(supply: SupplyModuleService, undo: RowsUndo) {
  if (undo.observation_ids.length) {
    await supply.deleteOfferObservations(undo.observation_ids)
  }

  if (undo.created_offer_ids.length) {
    await supply.deleteSupplierOffers(undo.created_offer_ids)
  }

  for (const snapshot of undo.updated) {
    await supply.updateSupplierOffers(snapshot)
  }

  await supply.updateImportRuns({ id: undo.run_id, ...undo.counters })
}

type FinishUndo = {
  run_id: string
  delisted_ids: string[]
  observation_ids: string[]
}

/**
 * Closes a price list: offers of the supplier that the list did not mention
 * are taken off the shelf, and that is written into their history.
 */
export const finishImportRunStep = createStep(
  "finish-supply-import-run",
  async (input: FinishImportRunInput, { container }) => {
    const supply = resolveSupply(container)
    const run = await supply.retrieveImportRun(input.run_id)

    if (run.status !== "open") {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "This price list is already finished"
      )
    }

    const now = new Date()
    const undo: FinishUndo = { run_id: run.id, delisted_ids: [], observation_ids: [] }
    const listed = await supply.listSupplierOffers(
      { supplier_id: run.supplier_id, is_listed: true },
      { select: ["id", "last_run_id", "price_minor", "currency_code"], take: null }
    )
    const gone = listed.filter((offer) => offer.last_run_id !== run.id)

    // A wrong file or a wrong column mapping shares no row with what the
    // supplier offered before; it must not wipe the supplier's whole shelf.
    if (gone.length && run.offers_updated + run.offers_unchanged === 0) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "The price list has no rows the supplier already offered; nothing was taken off the shelf. Check the file and the column mapping"
      )
    }

    try {
      for (const offer of gone) {
        await supply.updateSupplierOffers({ id: offer.id, is_listed: false })
        undo.delisted_ids.push(offer.id)
        const observation = await supply.createOfferObservations({
          offer_id: offer.id,
          price_minor: offer.price_minor,
          currency_code: offer.currency_code,
          stock_quantity: 0,
          is_listed: false,
          run_id: run.id,
          observed_at: now,
        })
        undo.observation_ids.push(observation.id)
      }

      await supply.updateImportRuns({
        id: run.id,
        status: "finished",
        offers_delisted: gone.length,
        finished_at: now,
      })
    } catch (error) {
      await undoFinish(supply, undo)
      throw error
    }

    return new StepResponse(
      await supply.retrieveImportRun(run.id),
      undo
    )
  },
  async (undo: FinishUndo | undefined, { container }) => {
    if (undo) {
      await undoFinish(resolveSupply(container), undo)
    }
  }
)

async function undoFinish(supply: SupplyModuleService, undo: FinishUndo) {
  if (undo.observation_ids.length) {
    await supply.deleteOfferObservations(undo.observation_ids)
  }

  for (const id of undo.delisted_ids) {
    await supply.updateSupplierOffers({ id, is_listed: true })
  }

  await supply.updateImportRuns({
    id: undo.run_id,
    status: "open",
    offers_delisted: 0,
    finished_at: null,
  })
}
