import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { createPartsBrandStep, CreateBrandInput } from "./steps/create-brand"
import {
  createPartNumberStep,
  CreatePartNumberInput,
} from "./steps/create-part-number"
import {
  createPartRelationshipStep,
  CreatePartRelationshipInput,
} from "./steps/create-part-relationship"
import { createPartsSourceStep, CreateSourceInput } from "./steps/create-source"
import {
  deletePartsBrandStep,
  deletePartNumberStep,
  deletePartRelationshipStep,
  DeleteRecordInput,
} from "./steps/delete-records"

export const createPartsBrandWorkflow = createWorkflow(
  "create-parts-brand",
  function (input: CreateBrandInput) {
    return new WorkflowResponse(createPartsBrandStep(input))
  }
)

export const createPartNumberWorkflow = createWorkflow(
  "create-part-number",
  function (input: CreatePartNumberInput) {
    return new WorkflowResponse(createPartNumberStep(input))
  }
)

export const createPartsSourceWorkflow = createWorkflow(
  "create-parts-source",
  function (input: CreateSourceInput) {
    return new WorkflowResponse(createPartsSourceStep(input))
  }
)

export const createPartRelationshipWorkflow = createWorkflow(
  "create-part-relationship",
  function (input: CreatePartRelationshipInput) {
    return new WorkflowResponse(createPartRelationshipStep(input))
  }
)

export const deletePartsBrandWorkflow = createWorkflow(
  "delete-parts-brand",
  function (input: DeleteRecordInput) {
    return new WorkflowResponse(deletePartsBrandStep(input))
  }
)

export const deletePartNumberWorkflow = createWorkflow(
  "delete-part-number",
  function (input: DeleteRecordInput) {
    return new WorkflowResponse(deletePartNumberStep(input))
  }
)

export const deletePartRelationshipWorkflow = createWorkflow(
  "delete-part-relationship",
  function (input: DeleteRecordInput) {
    return new WorkflowResponse(deletePartRelationshipStep(input))
  }
)
