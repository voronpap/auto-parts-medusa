import { MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { PARTS_CATALOG_MODULE } from "../../../modules/parts-catalog"
import PartsCatalogModuleService from "../../../modules/parts-catalog/service"

export type DeleteRecordInput = {
  id: string
}

// Records are soft deleted, so a failed workflow can restore them and history
// is not lost.

export const deletePartsBrandStep = createStep(
  "delete-parts-brand",
  async ({ id }: DeleteRecordInput, { container }) => {
    const catalog = container.resolve<PartsCatalogModuleService>(
      PARTS_CATALOG_MODULE
    )
    const numbers = await catalog.listPartNumbers({ brand_id: id }, { take: 1 })

    if (numbers.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "This brand still has part numbers; delete them first"
      )
    }

    await catalog.softDeleteBrands(id)

    return new StepResponse({ id }, id)
  },
  async (id: string | undefined, { container }) => {
    if (!id) {
      return
    }

    const catalog = container.resolve<PartsCatalogModuleService>(
      PARTS_CATALOG_MODULE
    )
    await catalog.restoreBrands(id)
  }
)

export const deletePartNumberStep = createStep(
  "delete-part-number",
  async ({ id }: DeleteRecordInput, { container }) => {
    const catalog = container.resolve<PartsCatalogModuleService>(
      PARTS_CATALOG_MODULE
    )
    const relationships = await catalog.listPartRelationships(
      {
        $or: [{ from_part_number_id: id }, { to_part_number_id: id }],
      },
      { take: 1 }
    )

    if (relationships.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "This part number has relationships; delete them first"
      )
    }

    await catalog.softDeletePartNumbers(id)

    return new StepResponse({ id }, id)
  },
  async (id: string | undefined, { container }) => {
    if (!id) {
      return
    }

    const catalog = container.resolve<PartsCatalogModuleService>(
      PARTS_CATALOG_MODULE
    )
    await catalog.restorePartNumbers(id)
  }
)

export const deletePartRelationshipStep = createStep(
  "delete-part-relationship",
  async ({ id }: DeleteRecordInput, { container }) => {
    const catalog = container.resolve<PartsCatalogModuleService>(
      PARTS_CATALOG_MODULE
    )
    await catalog.softDeletePartRelationships(id)

    return new StepResponse({ id }, id)
  },
  async (id: string | undefined, { container }) => {
    if (!id) {
      return
    }

    const catalog = container.resolve<PartsCatalogModuleService>(
      PARTS_CATALOG_MODULE
    )
    await catalog.restorePartRelationships(id)
  }
)
