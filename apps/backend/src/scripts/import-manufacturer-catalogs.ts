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
import { readFile } from "fs/promises"
import path from "path"
import {
  createPartsBrandWorkflow,
  createPartsSourceWorkflow,
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
  const counts = { sources: 0, brands: 0, skipped: 0 }

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
    await run("sources", () =>
      createPartsSourceWorkflow(container).run({
        input: {
          name: `${entry.name} (каталог виробника)`,
          kind: entry.kind,
          // Public to read is not permission to collect automatically, so the
          // class stays conservative until the terms of each site are checked.
          license_class: "REFERENCE_ONLY",
          lineage: entry.lineage,
          url: entry.catalog_url || null,
          license_note: [
            `Група: ${entry.group}.`,
            `Доступ: ${entry.access}.`,
            entry.search ? `Пошук: ${entry.search}.` : "",
            entry.note,
            entry.official_url ? `Офіційне джерело: ${entry.official_url}.` : "",
            entry.checked_at ? `Перевірено: ${entry.checked_at}.` : "",
            "Умови використання для автоматичного збирання не перевірено.",
          ]
            .filter(Boolean)
            .join(" ")
            .slice(0, 2000),
        },
      })
    )

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
    `${dryRun ? "[dry-run] " : ""}Manufacturer catalogs: ${counts.sources} sources, ${counts.brands} brands, ${counts.skipped} already present`
  )
}
