import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { SUPPLY_MODULE } from "../../../modules/supply"
import SupplyModuleService from "../../../modules/supply/service"

export type CreatePartsRequestInput = {
  name: string
  phone: string
  vin?: string | null
  car?: string | null
  message: string
}

export type UpdatePartsRequestInput = {
  id: string
  status?: "new" | "in_progress" | "answered" | "closed"
  note?: string | null
}

export const createPartsRequestStep = createStep(
  "create-parts-request",
  async (input: CreatePartsRequestInput, { container }) => {
    const supply = container.resolve<SupplyModuleService>(SUPPLY_MODULE)
    const request = await supply.createPartsRequests({ ...input, status: "new" })

    return new StepResponse(request, request.id)
  },
  async (id: string | undefined, { container }) => {
    if (id) {
      await container.resolve<SupplyModuleService>(SUPPLY_MODULE).deletePartsRequests(id)
    }
  }
)

export const updatePartsRequestStep = createStep(
  "update-parts-request",
  async (input: UpdatePartsRequestInput, { container }) => {
    const supply = container.resolve<SupplyModuleService>(SUPPLY_MODULE)
    const before = await supply.retrievePartsRequest(input.id)
    const updated = await supply.updatePartsRequests(input)

    return new StepResponse(updated, { id: before.id, status: before.status, note: before.note })
  },
  async (before, { container }) => {
    if (before) {
      await container.resolve<SupplyModuleService>(SUPPLY_MODULE).updatePartsRequests(before)
    }
  }
)
