import { MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { PARTS_CATALOG_MODULE } from "../../../modules/parts-catalog"
import {
  LicenseClass,
  SourceKind,
} from "../../../modules/parts-catalog/constants"
import PartsCatalogModuleService from "../../../modules/parts-catalog/service"
import { normalizeBrandName } from "../../../modules/parts-catalog/utils/normalize"

export type CreateSourceInput = {
  name: string
  kind: SourceKind
  license_class: LicenseClass
  lineage?: string
  url?: string | null
  license_note?: string | null
}

export const createPartsSourceStep = createStep(
  "create-parts-source",
  async (input: CreateSourceInput, { container }) => {
    const catalog = container.resolve<PartsCatalogModuleService>(
      PARTS_CATALOG_MODULE
    )
    const name = input.name.trim()
    const existing = await catalog.listSources({ name })

    if (existing.length) {
      throw new MedusaError(
        MedusaError.Types.DUPLICATE_ERROR,
        `Source "${name}" already exists`
      )
    }

    // A source with no stated upstream is its own lineage.
    const lineage = normalizeBrandName(input.lineage?.trim() || name)
    const source = await catalog.createSources({
      name,
      kind: input.kind,
      license_class: input.license_class,
      lineage,
      url: input.url?.trim() || null,
      license_note: input.license_note?.trim() || null,
    })

    return new StepResponse(source, source.id)
  },
  async (sourceId: string | undefined, { container }) => {
    if (!sourceId) {
      return
    }

    const catalog = container.resolve<PartsCatalogModuleService>(
      PARTS_CATALOG_MODULE
    )
    await catalog.deleteSources(sourceId)
  }
)
