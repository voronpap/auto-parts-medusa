import { MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { PARTS_CATALOG_MODULE } from "../../../modules/parts-catalog"
import { NumberType } from "../../../modules/parts-catalog/constants"
import PartsCatalogModuleService from "../../../modules/parts-catalog/service"
import {
  formatDisplayNumber,
  normalizePartNumber,
} from "../../../modules/parts-catalog/utils/normalize"

export type CreatePartNumberInput = {
  brand_id: string
  number_type: NumberType
  number: string
}

export const createPartNumberStep = createStep(
  "create-part-number",
  async (input: CreatePartNumberInput, { container }) => {
    const catalog = container.resolve<PartsCatalogModuleService>(
      PARTS_CATALOG_MODULE
    )
    const normalized = normalizePartNumber(input.number)

    if (!normalized) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Part number must contain letters or digits"
      )
    }

    const brand = await catalog.retrieveBrand(input.brand_id)
    const existing = await catalog.listPartNumbers({
      brand_id: brand.id,
      number_type: input.number_type,
      normalized_number: normalized,
    })

    if (existing.length) {
      throw new MedusaError(
        MedusaError.Types.DUPLICATE_ERROR,
        `${brand.name} already has the ${input.number_type} number ${existing[0].display_number}`
      )
    }

    const partNumber = await catalog.createPartNumbers({
      brand_id: brand.id,
      number_type: input.number_type,
      source_number: input.number,
      display_number: formatDisplayNumber(input.number),
      normalized_number: normalized,
    })

    await catalog.createPartNumberSearchKeys({
      key: normalized,
      part_number_id: partNumber.id,
    })

    return new StepResponse(partNumber, partNumber.id)
  },
  async (partNumberId: string | undefined, { container }) => {
    if (!partNumberId) {
      return
    }

    const catalog = container.resolve<PartsCatalogModuleService>(
      PARTS_CATALOG_MODULE
    )
    await catalog.deletePartNumbers(partNumberId)
  }
)
