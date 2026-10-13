import {
  createWorkflow,
  transform,
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
import {
  createPartsSourceStep,
  CreateSourceInput,
  updatePartsSourceStep,
  UpdateSourceInput,
} from "./steps/create-source"
import {
  ingestLookupResultStep,
  IngestLookupResultInput,
  LookupResult,
} from "./steps/ingest-lookup-result"
import {
  createVehicleMakeStep,
  CreateVehicleMakeInput,
  mergeVehicleMakesStep,
  mergeVehicleModelsStep,
  MergeVehiclesInput,
  seedVehicleMakesStep,
  SeedVehicleMakesInput,
} from "./steps/vehicles"
import {
  claimLookupTasksStep,
  ClaimLookupTasksInput,
  createLookupTaskStep,
  CreateLookupTaskInput,
  prepareImportStep,
  PrepareImportInput,
} from "./steps/lookup-tasks"
import {
  mergePartsBrandsStep,
  requeueProductNumbersStep,
  MergeBrandsInput,
  updatePartRelationshipStep,
  UpdatePartRelationshipInput,
  updatePartsBrandStep,
  UpdateBrandInput,
} from "./steps/edit-records"
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

export const createVehicleMakeWorkflow = createWorkflow(
  "create-vehicle-make",
  function (input: CreateVehicleMakeInput) {
    return new WorkflowResponse(createVehicleMakeStep(input))
  }
)

export const seedVehicleMakesWorkflow = createWorkflow(
  "seed-vehicle-makes",
  function (input: SeedVehicleMakesInput) {
    return new WorkflowResponse(seedVehicleMakesStep(input))
  }
)

export const mergeVehicleModelsWorkflow = createWorkflow(
  "merge-vehicle-models",
  function (input: MergeVehiclesInput) {
    return new WorkflowResponse(mergeVehicleModelsStep(input))
  }
)

export const mergeVehicleMakesWorkflow = createWorkflow(
  "merge-vehicle-makes",
  function (input: MergeVehiclesInput) {
    return new WorkflowResponse(mergeVehicleMakesStep(input))
  }
)

export const updatePartsSourceWorkflow = createWorkflow(
  "update-parts-source",
  function (input: UpdateSourceInput) {
    return new WorkflowResponse(updatePartsSourceStep(input))
  }
)

export type ImportPartNumberResultInput = PrepareImportInput & {
  result: LookupResult
}

export const importPartNumberResultWorkflow = createWorkflow(
  "import-part-number-result",
  function (input: ImportPartNumberResultInput) {
    const prepared = prepareImportStep(input)
    const ingest = transform({ prepared, input }, (data) => ({
      task_id: data.prepared.task_id,
      result: data.input.result,
    }))

    return new WorkflowResponse(ingestLookupResultStep(ingest))
  }
)

export const updatePartsBrandWorkflow = createWorkflow(
  "update-parts-brand",
  function (input: UpdateBrandInput) {
    return new WorkflowResponse(updatePartsBrandStep(input))
  }
)

export const mergePartsBrandsWorkflow = createWorkflow(
  "merge-parts-brands",
  function (input: MergeBrandsInput) {
    return new WorkflowResponse(mergePartsBrandsStep(input))
  }
)

export const updatePartRelationshipWorkflow = createWorkflow(
  "update-part-relationship",
  function (input: UpdatePartRelationshipInput) {
    return new WorkflowResponse(updatePartRelationshipStep(input))
  }
)

export const requeueProductNumbersWorkflow = createWorkflow(
  "requeue-product-numbers",
  function () {
    return new WorkflowResponse(requeueProductNumbersStep({}))
  }
)
