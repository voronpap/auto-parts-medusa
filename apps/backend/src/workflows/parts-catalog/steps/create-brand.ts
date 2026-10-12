import { MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { PARTS_CATALOG_MODULE } from "../../../modules/parts-catalog"
import { BrandKind } from "../../../modules/parts-catalog/constants"
import PartsCatalogModuleService from "../../../modules/parts-catalog/service"
import { normalizeBrandName } from "../../../modules/parts-catalog/utils/normalize"

export type CreateBrandInput = {
  name: string
  kind?: BrandKind
  aliases?: string[]
}

export const createPartsBrandStep = createStep(
  "create-parts-brand",
  async (input: CreateBrandInput, { container }) => {
    const catalog = container.resolve<PartsCatalogModuleService>(
      PARTS_CATALOG_MODULE
    )
    const name = input.name.trim()
    const normalizedName = normalizeBrandName(name)

    if (!normalizedName) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Brand name must contain letters or digits"
      )
    }

    // Aliases that normalize to the brand name or to each other add nothing.
    const aliases = new Map<string, string>()

    for (const raw of input.aliases ?? []) {
      const alias = raw.trim()
      const normalized = normalizeBrandName(alias)

      if (normalized && normalized !== normalizedName) {
        aliases.set(normalized, alias)
      }
    }

    const keys = [normalizedName, ...aliases.keys()]
    const [takenNames, takenAliases] = await Promise.all([
      catalog.listBrands({ normalized_name: keys }),
      catalog.listBrandAliasRecords({ normalized_alias: keys }),
    ])

    if (takenNames.length || takenAliases.length) {
      const taken = takenNames[0]?.name ?? takenAliases[0]?.alias

      throw new MedusaError(
        MedusaError.Types.DUPLICATE_ERROR,
        `A brand or alias matching "${taken}" already exists`
      )
    }

    const brand = await catalog.createBrands({
      name,
      normalized_name: normalizedName,
      kind: input.kind ?? "parts_manufacturer",
    })

    if (aliases.size) {
      await catalog.createBrandAliasRecords(
        [...aliases].map(([normalized, alias]) => ({
          alias,
          normalized_alias: normalized,
          brand_id: brand.id,
        }))
      )
    }

    return new StepResponse(brand, brand.id)
  },
  async (brandId: string | undefined, { container }) => {
    if (!brandId) {
      return
    }

    const catalog = container.resolve<PartsCatalogModuleService>(
      PARTS_CATALOG_MODULE
    )
    await catalog.deleteBrands(brandId)
  }
)
