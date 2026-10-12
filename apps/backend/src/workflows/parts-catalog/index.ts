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
  ingestLookupResultStep,
  IngestLookupResultInput,
} from "./steps/ingest-lookup-result"
import {
  claimLookupTasksStep,
  ClaimLookupTasksInput,
  createLookupTaskStep,
  CreateLookupTaskInput,
} from "./steps/lookup-tasks"
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
    const partNumber = createPartNumberStep(input)

    // Every new number is queued for the parser service to look up.
    createLookupTaskStep({ part_number_id: partNumber.id })

    return new WorkflowResponse(partNumber)
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

export const createLookupTaskWorkflow = createWorkflow(
  "create-lookup-task",
  function (input: CreateLookupTaskInput) {
    return new WorkflowResponse(createLookupTaskStep(input))
  }
)

export const claimLookupTasksWorkflow = createWorkflow(
  "claim-lookup-tasks",
  function (input: ClaimLookupTasksInput) {
    return new WorkflowResponse(claimLookupTasksStep(input))
  }
)

export const ingestLookupResultWorkflow = createWorkflow(
  "ingest-lookup-result",
  function (input: IngestLookupResultInput) {
    return new WorkflowResponse(ingestLookupResultStep(input))
  }
)
