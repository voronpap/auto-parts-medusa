import { Modules } from "@medusajs/framework/utils"
import {
  createWorkflow,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { createRemoteLinkStep } from "@medusajs/medusa/core-flows"
import { PARTS_CATALOG_MODULE } from "../../modules/parts-catalog"
import {
  catalogProductVariantsStep,
  CatalogProductVariantsInput,
} from "./steps/catalog-product-variants"

export const catalogProductWorkflow = createWorkflow(
  "catalog-product",
  function (input: CatalogProductVariantsInput) {
    const result = catalogProductVariantsStep(input)
    const links = transform({ result }, (data) =>
      data.result.links.map((link) => ({
        [Modules.PRODUCT]: { product_variant_id: link.variant_id },
        [PARTS_CATALOG_MODULE]: { part_number_id: link.part_number_id },
      }))
    )

    when({ links }, (data) => data.links.length > 0).then(() => {
      createRemoteLinkStep(links)
    })

    return new WorkflowResponse(result)
  }
)
