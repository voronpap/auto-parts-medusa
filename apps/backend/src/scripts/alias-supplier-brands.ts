/**
 * Teaches the catalog how suppliers spell the brands it already has, so their
 * offers land on the existing brand instead of creating a duplicate.
 *
 *   pnpm exec medusa exec ./src/scripts/alias-supplier-brands.ts
 *
 * Safe to re-run: an alias that already exists is left alone.
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { PARTS_CATALOG_MODULE } from "../modules/parts-catalog"
import PartsCatalogModuleService from "../modules/parts-catalog/service"
import { normalizeBrandName } from "../modules/parts-catalog/utils/normalize"
import { updatePartsBrandWorkflow } from "../workflows/parts-catalog"

// Supplier spelling -> brand name in the catalog.
const ALIASES: Record<string, string> = {
  MANN: "MANN-FILTER",
  VICT_REINZ: "Victor Reinz",
  MAGNETI: "MAGNETI MARELLI",
  LEMFORDER: "LEMFÖRDER",
  LESJOFORS: "Lesjöfors",
  KS: "Kolbenschmidt",
  ZIMMERMANN: "Otto Zimmermann",
  NURAL: "Nüral",
  VERNET: "CALORSTAT by Vernet",
  AS: "AS-PL",
  VAG: "VW",
}

export default async function aliasSupplierBrands({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const catalog =
    container.resolve<PartsCatalogModuleService>(PARTS_CATALOG_MODULE)

  for (const [alias, name] of Object.entries(ALIASES)) {
    const [brand] = await catalog.listBrands(
      { normalized_name: normalizeBrandName(name) },
      { relations: ["aliases"] }
    )

    if (!brand) {
      logger.warn(`Brand ${name} is not in the catalog; alias ${alias} skipped`)
      continue
    }

    const key = normalizeBrandName(alias)

    if (
      brand.normalized_name === key ||
      brand.aliases.some((item) => item.normalized_alias === key)
    ) {
      continue
    }

    try {
      await updatePartsBrandWorkflow(container).run({
        input: {
          id: brand.id,
          aliases: [...brand.aliases.map((item) => item.alias), alias],
        },
      })
      logger.info(`${alias} -> ${brand.name}`)
    } catch (error) {
      logger.warn(
        `${alias} -> ${name} was not added: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
}
