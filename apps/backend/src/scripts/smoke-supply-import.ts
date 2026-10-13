/**
 * Checks loading of supplier price lists end to end on a throwaway supplier,
 * then removes everything it created.
 *
 *   pnpm exec medusa exec ./src/scripts/smoke-supply-import.ts
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { PARTS_CATALOG_MODULE } from "../modules/parts-catalog"
import PartsCatalogModuleService from "../modules/parts-catalog/service"
import { SUPPLY_MODULE } from "../modules/supply"
import SupplyModuleService from "../modules/supply/service"
import {
  createSupplierWorkflow,
  finishSupplyImportRunWorkflow,
  importSupplyOfferRowsWorkflow,
  openSupplyImportRunWorkflow,
} from "../workflows/supply"

const check = (condition: unknown, message: string) => {
  if (!condition) {
    throw new Error(`FAILED: ${message}`)
  }
}

export default async function smokeSupplyImport({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const supply = container.resolve<SupplyModuleService>(SUPPLY_MODULE)
  const catalog =
    container.resolve<PartsCatalogModuleService>(PARTS_CATALOG_MODULE)
  const tag = `ZZSMOKE${Date.now().toString(36).toUpperCase()}`
  const { result: supplier } = await createSupplierWorkflow(container).run({
    input: { name: `${tag} Supplier`, lead_days: 2 },
  })
  // A number the catalog really has, to check matching.
  const [known] = await catalog.listPartNumbers(
    { number_type: "aftermarket" },
    { relations: ["brand"], take: 1 }
  )
  const load = async (fileName: string, rows: Record<string, unknown>[]) => {
    const { result: run } = await openSupplyImportRunWorkflow(container).run({
      input: { supplier_id: supplier.id, file_name: fileName },
    })
    const { result: part } = await importSupplyOfferRowsWorkflow(container).run({
      input: { run_id: run.id, rows: rows as never },
    })
    const { result: finished } = await finishSupplyImportRunWorkflow(
      container
    ).run({ input: { run_id: run.id } })

    return { part, finished }
  }

  try {
    const first = await load("first.xlsx", [
      { brand: known.brand.name, number: known.display_number, price: "1 234,50", stock: ">10" },
      { brand: `${tag} Brand`, number: "ZZ-100", title: "Тестова деталь", price: 99.9, stock: 3 },
      { brand: `${tag} Brand`, number: "ZZ 200", price: "450", stock: "в наявності" },
      { brand: `${tag} Brand`, number: "ZZ 300", price: "за запитом" },
      { brand: "", number: "ZZ 400", price: "10" },
    ])
    check(first.part.created === 3, `3 offers are created, got ${first.part.created}`)
    check(first.part.skipped === 2, "rows without a price or a brand are skipped")
    check(first.part.matched === 1, "the number the catalog knows is matched")
    check(first.finished.status === "finished", "the run is finished")
    check(
      (first.finished.errors as { items: unknown[] }).items.length === 2,
      "refused rows are reported with a reason"
    )

    const offers = await supply.listSupplierOffers({ supplier_id: supplier.id })
    const matched = offers.find((offer) => offer.part_number_id === known.id)
    check(matched?.price_minor === 123450, "the price is kept in minor units")
    check(matched?.stock_quantity === 10 && matched.stock_text === ">10", "stock wording is kept")

    const second = await load("second.xlsx", [
      { brand: known.brand.name, number: known.display_number, price: "1 300", stock: ">10" },
      // Written differently, the same number.
      { brand: `${tag} BRAND`, number: "zz100", price: 99.9, stock: 3 },
    ])
    check(second.part.updated === 1, "a changed price updates the offer")
    check(second.part.unchanged === 1, "an unchanged row adds no history")
    check(second.finished.offers_delisted === 1, "a row missing from the new list is delisted")

    const gone = (await supply.listSupplierOffers({ supplier_id: supplier.id })).find(
      (offer) => offer.normalized_number === "ZZ200"
    )
    check(gone?.is_listed === false, "the missing offer is off the shelf")
    const history = await supply.listOfferObservations(
      { offer_id: matched!.id },
      { order: { observed_at: "ASC" } }
    )
    check(
      history.length === 2 && history[1].price_minor === 130000,
      "price history has both prices"
    )

    const refused = await load("empty.xlsx", [
      { brand: `${tag} Other`, number: "QQ 1", price: "5" },
    ])
      .then(() => false)
      .catch(() => true)
    check(refused, "a list with none of the supplier's rows does not wipe the shelf")
    logger.info("Supply import smoke test passed")
  } finally {
    const offers = await supply.listSupplierOffers(
      { supplier_id: supplier.id },
      { select: ["id"], take: null }
    )
    const observations = offers.length
      ? await supply.listOfferObservations(
          { offer_id: offers.map((offer) => offer.id) },
          { select: ["id"], take: null }
        )
      : []
    const runs = await supply.listImportRuns({ supplier_id: supplier.id })

    if (observations.length) {
      await supply.deleteOfferObservations(observations.map((row) => row.id))
    }

    if (offers.length) {
      await supply.deleteSupplierOffers(offers.map((offer) => offer.id))
    }

    if (runs.length) {
      await supply.deleteImportRuns(runs.map((run) => run.id))
    }

    await supply.deleteSuppliers(supplier.id)
    logger.info("Smoke records removed")
  }
}
