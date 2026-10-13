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
