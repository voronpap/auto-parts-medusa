import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { PARTS_CATALOG_MODULE } from "../../../modules/parts-catalog"
import { NumberType } from "../../../modules/parts-catalog/constants"
import PartsCatalogModuleService from "../../../modules/parts-catalog/service"
import {
  formatDisplayNumber,
  normalizePartNumber,
} from "../../../modules/parts-catalog/utils/normalize"

export type CatalogProductVariantsInput = {
  product_id: string
  brand_id: string
  number_type: NumberType
}

export type VariantNumberLink = {
  variant_id: string
  part_number_id: string
}

type Created = {
  part_number_ids: string[]
  lookup_task_ids: string[]
}

type VariantRow = {
  id: string
  sku?: string | null
  part_numbers?: ({ id: string } | null)[] | null
}

/**
 * For every variant of a product that has a SKU, finds or creates the part
 * number for that SKU under the given brand and queues new numbers for the
 * parser service. Returns the variant-number pairs that still need linking.
 */
export const catalogProductVariantsStep = createStep(
  "catalog-product-variants",
  async (input: CatalogProductVariantsInput, { container }) => {
    const catalog = container.resolve<PartsCatalogModuleService>(
      PARTS_CATALOG_MODULE
    )
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const brand = await catalog.retrieveBrand(input.brand_id)
    const { data: variants } = await query.graph({
      entity: "product_variant",
      fields: ["id", "sku", "part_numbers.id"],
      filters: { product_id: input.product_id },
    })

    if (!variants.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Product has no variants"
      )
    }

    const created: Created = { part_number_ids: [], lookup_task_ids: [] }
    const links: VariantNumberLink[] = []
    let withoutSku = 0

    try {
      for (const variant of variants as VariantRow[]) {
        const normalized = variant.sku ? normalizePartNumber(variant.sku) : ""

        if (!variant.sku || !normalized) {
          withoutSku += 1
          continue
        }

        let [partNumber] = await catalog.listPartNumbers({
          brand_id: brand.id,
          number_type: input.number_type,
          normalized_number: normalized,
        })

        if (!partNumber) {
          partNumber = await catalog.createPartNumbers({
            brand_id: brand.id,
            number_type: input.number_type,
            source_number: variant.sku,
            display_number: formatDisplayNumber(variant.sku),
            normalized_number: normalized,
          })
          created.part_number_ids.push(partNumber.id)
          await catalog.createPartNumberSearchKeys({
            key: normalized,
            part_number_id: partNumber.id,
          })

          const task = await catalog.createLookupTasks({
            part_number_id: partNumber.id,
            status: "pending",
          })
          created.lookup_task_ids.push(task.id)
        }

        const linked = (variant.part_numbers ?? []).some(
          (item) => item?.id === partNumber.id
        )

        if (!linked) {
          links.push({ variant_id: variant.id, part_number_id: partNumber.id })
        }
      }
    } catch (error) {
      // A step that throws is not compensated, so undo partial writes here.
      if (created.part_number_ids.length) {
        await catalog.deletePartNumbers(created.part_number_ids)
      }

      throw error
    }

    return new StepResponse(
      {
        links,
        numbers_created: created.part_number_ids.length,
        variants_without_sku: withoutSku,
      },
      created
    )
  },
  async (created: Created | undefined, { container }) => {
    if (!created?.part_number_ids.length) {
      return
    }

    const catalog = container.resolve<PartsCatalogModuleService>(
      PARTS_CATALOG_MODULE
    )

    // Lookup tasks and search keys go with their part number.
    await catalog.deletePartNumbers(created.part_number_ids)
  }
)
