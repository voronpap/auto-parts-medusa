import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  finishImportRunStep,
  FinishImportRunInput,
  importOfferRowsStep,
  ImportOfferRowsInput,
  openImportRunStep,
  OpenImportRunInput,
} from "./steps/import-offers"
import {
  createProductsFromOffersStep,
  CreateProductsFromOffersInput,
} from "./steps/offer-products"
import {
  createPartsRequestStep,
  CreatePartsRequestInput,
  updatePartsRequestStep,
  UpdatePartsRequestInput,
} from "./steps/parts-requests"
import {
  createProductByNumberStep,
  CreateProductByNumberInput,
} from "./steps/product-by-number"
import {
  applyOffersToProductsStep,
  createPricingRuleStep,
  CreatePricingRuleInput,
  deletePricingRuleStep,
  updatePricingSettingsStep,
  UpdatePricingSettingsInput,
} from "./steps/pricing"
import {
  createSupplierStep,
  CreateSupplierInput,
  deleteSupplierStep,
} from "./steps/suppliers"

export const createSupplierWorkflow = createWorkflow(
  "create-supplier",
  function (input: CreateSupplierInput) {
    return new WorkflowResponse(createSupplierStep(input))
  }
)

export const deleteSupplierWorkflow = createWorkflow(
  "delete-supplier",
  function (input: { id: string }) {
    return new WorkflowResponse(deleteSupplierStep(input))
  }
)

export const openSupplyImportRunWorkflow = createWorkflow(
  "open-supply-import-run",
  function (input: OpenImportRunInput) {
    return new WorkflowResponse(openImportRunStep(input))
  }
)

export const importSupplyOfferRowsWorkflow = createWorkflow(
  "import-supply-offer-rows",
  function (input: ImportOfferRowsInput) {
    return new WorkflowResponse(importOfferRowsStep(input))
  }
)

export const finishSupplyImportRunWorkflow = createWorkflow(
  "finish-supply-import-run",
  function (input: FinishImportRunInput) {
    return new WorkflowResponse(finishImportRunStep(input))
  }
)

export const updateSupplyPricingSettingsWorkflow = createWorkflow(
  "update-supply-pricing-settings",
  function (input: UpdatePricingSettingsInput) {
    return new WorkflowResponse(updatePricingSettingsStep(input))
  }
)

export const createSupplyPricingRuleWorkflow = createWorkflow(
  "create-supply-pricing-rule",
  function (input: CreatePricingRuleInput) {
    return new WorkflowResponse(createPricingRuleStep(input))
  }
)

export const deleteSupplyPricingRuleWorkflow = createWorkflow(
  "delete-supply-pricing-rule",
  function (input: { id: string }) {
    return new WorkflowResponse(deletePricingRuleStep(input))
  }
)

export const applySupplyOffersToProductsWorkflow = createWorkflow(
  "apply-supply-offers-to-products",
  function () {
    return new WorkflowResponse(applyOffersToProductsStep({}))
  }
)

export const createProductsFromSupplyOffersWorkflow = createWorkflow(
  "create-products-from-supply-offers",
  function (input: CreateProductsFromOffersInput) {
    return new WorkflowResponse(createProductsFromOffersStep(input))
  }
)

export const createProductByNumberWorkflow = createWorkflow(
  "create-product-by-number",
  function (input: CreateProductByNumberInput) {
    return new WorkflowResponse(createProductByNumberStep(input))
  }
)

export const createPartsRequestWorkflow = createWorkflow(
  "create-parts-request",
  function (input: CreatePartsRequestInput) {
    return new WorkflowResponse(createPartsRequestStep(input))
  }
)

export const updatePartsRequestWorkflow = createWorkflow(
  "update-parts-request",
  function (input: UpdatePartsRequestInput) {
    return new WorkflowResponse(updatePartsRequestStep(input))
  }
)
