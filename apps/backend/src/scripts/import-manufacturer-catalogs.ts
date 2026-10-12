/**
 * Loads the list of public manufacturer catalogs into the parts catalog:
 * one source per catalog and one brand per manufacturer brand it covers.
 * Anything that already exists is skipped, so it is safe to run again.
 *
 *   DRY_RUN=1 pnpm exec medusa exec ./src/scripts/import-manufacturer-catalogs.ts
 *   pnpm exec medusa exec ./src/scripts/import-manufacturer-catalogs.ts
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { PARTS_CATALOG_MODULE } from "../modules/parts-catalog"
import { LicenseClass } from "../modules/parts-catalog/constants"
import PartsCatalogModuleService from "../modules/parts-catalog/service"
import { readFile } from "fs/promises"
import path from "path"
import {
  createPartsBrandWorkflow,
  createPartsSourceWorkflow,
  updatePartsSourceWorkflow,
} from "../workflows/parts-catalog"

type CatalogEntry = {
  id: number
  group: string
  name: string
  brands: string[]
  catalog_url: string
  access: string
  search: string
  note: string
  official_url: string
  checked_at: string | null
  kind: "oem_catalog" | "manufacturer_catalog"
  lineage: string
  platform: string | null
  license_class: LicenseClass
}

const DATA_FILE = "src/modules/parts-catalog/data/manufacturer-catalogs.json"

// An error rethrown by a workflow run is not always an Error instance, so
// the type field is read directly.
const isDuplicate = (error: unknown) =>
  (error as { type?: string } | null)?.type ===
  MedusaError.Types.DUPLICATE_ERROR

export default async function importManufacturerCatalogs({
  container,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const dryRun = process.env.DRY_RUN === "1"
  const entries: CatalogEntry[] = JSON.parse(
    await readFile(path.resolve(process.cwd(), DATA_FILE), "utf-8")
  )
  const catalog = container.resolve<PartsCatalogModuleService>(
    PARTS_CATALOG_MODULE
  )
  const counts = { sources: 0, brands: 0, skipped: 0, updated: 0 }

  const run = async (kind: "sources" | "brands", create: () => Promise<unknown>) => {
    if (dryRun) {
      counts[kind] += 1
      return
    }

    try {
      await create()
      counts[kind] += 1
    } catch (error) {
      if (!isDuplicate(error)) {
        throw error
      }

      counts.skipped += 1
    }
  }

  for (const entry of entries) {
    const name = `${entry.name} (каталог виробника)`
    const fields = {
      kind: entry.kind,
      license_class: entry.license_class,
      // A manufacturer's own catalog is that manufacturer's data, whichever
      // platform hosts it.
      lineage: entry.lineage,
      url: entry.catalog_url || null,
      license_note: [
        `Група: ${entry.group}.`,
        `Доступ: ${entry.access}.`,
        entry.platform ? `Платформа: ${entry.platform}.` : "",
        entry.search ? `Пошук: ${entry.search}.` : "",
        entry.note,
        entry.official_url ? `Офіційне джерело: ${entry.official_url}.` : "",
        entry.checked_at ? `Перевірено: ${entry.checked_at}.` : "",
      ]
        .filter(Boolean)
        .join(" ")
        .slice(0, 2000),
    }
    const [existing] = await catalog.listSources({ name })

    if (existing) {
      if (!dryRun) {
        await updatePartsSourceWorkflow(container).run({
          input: { id: existing.id, ...fields },
        })
      }

      counts.updated += 1
    } else {
      await run("sources", () =>
        createPartsSourceWorkflow(container).run({ input: { name, ...fields } })
      )
    }

    for (const brand of entry.brands) {
      await run("brands", () =>
        createPartsBrandWorkflow(container).run({
          input: {
            name: brand,
            kind:
              entry.kind === "oem_catalog"
                ? "vehicle_manufacturer"
                : "parts_manufacturer",
          },
        })
      )
    }
  }

  logger.info(
    `${dryRun ? "[dry-run] " : ""}Manufacturer catalogs: ${counts.sources} sources created, ${counts.updated} updated, ${counts.brands} brands created, ${counts.skipped} brands already present`
  )
}
