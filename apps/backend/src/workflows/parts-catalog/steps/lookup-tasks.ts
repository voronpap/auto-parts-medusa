import { MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { PARTS_CATALOG_MODULE } from "../../../modules/parts-catalog"
import {
  LookupTaskStatus,
  NumberType,
} from "../../../modules/parts-catalog/constants"
import PartsCatalogModuleService from "../../../modules/parts-catalog/service"
import {
  formatDisplayNumber,
  normalizeBrandName,
  normalizePartNumber,
} from "../../../modules/parts-catalog/utils/normalize"

// A claimed task whose worker went silent becomes claimable again.
const CLAIM_TIMEOUT_MS = 30 * 60 * 1000

export type CreateLookupTaskInput = {
  part_number_id: string
}

export type ClaimLookupTasksInput = {
  worker: string
  limit: number
}

type PreviousClaim = {
  id: string
  status: LookupTaskStatus
  worker: string | null
  claimed_at: Date | null
}

export const createLookupTaskStep = createStep(
  "create-lookup-task",
  async (input: CreateLookupTaskInput, { container }) => {
    const catalog = container.resolve<PartsCatalogModuleService>(
      PARTS_CATALOG_MODULE
    )

    await catalog.retrievePartNumber(input.part_number_id)

    // One open task per number is enough; asking again returns it.
    const [open] = await catalog.listLookupTasks(
      {
        part_number_id: input.part_number_id,
        status: ["pending", "claimed"],
      },
      { take: 1 }
    )

    if (open) {
      // Nothing was created, so there is nothing to undo.
      return new StepResponse(open, undefined as string | undefined)
    }

    const task = await catalog.createLookupTasks({
      part_number_id: input.part_number_id,
      status: "pending",
    })

    return new StepResponse(task, task.id as string | undefined)
  },
  async (taskId: string | undefined, { container }) => {
    if (!taskId) {
      return
    }

    const catalog = container.resolve<PartsCatalogModuleService>(
      PARTS_CATALOG_MODULE
    )
    await catalog.deleteLookupTasks(taskId)
  }
)

export const claimLookupTasksStep = createStep(
  "claim-lookup-tasks",
  async (input: ClaimLookupTasksInput, { container }) => {
    const catalog = container.resolve<PartsCatalogModuleService>(
      PARTS_CATALOG_MODULE
    )
    const now = new Date()
    const tasks = await catalog.listLookupTasks(
      {
        $or: [
          { status: "pending" },
          {
            status: "claimed",
            claimed_at: { $lt: new Date(now.getTime() - CLAIM_TIMEOUT_MS) },
          },
        ],
      },
      {
        take: input.limit,
        order: { created_at: "ASC" },
        relations: ["part_number", "part_number.brand"],
      }
    )

    if (!tasks.length) {
      return new StepResponse([], [])
    }

    const previous: PreviousClaim[] = tasks.map((task) => ({
      id: task.id,
      status: task.status,
      worker: task.worker,
      claimed_at: task.claimed_at,
    }))

    await catalog.updateLookupTasks(
      tasks.map((task) => ({
        id: task.id,
        status: "claimed" as const,
        worker: input.worker,
        claimed_at: now,
      }))
    )

    return new StepResponse(
      tasks.map((task) => ({
        id: task.id,
        brand: task.part_number.brand.name,
        number: task.part_number.source_number,
        number_type: task.part_number.number_type,
        normalized_number: task.part_number.normalized_number,
      })),
      previous
    )
  },
  async (previous: PreviousClaim[] | undefined, { container }) => {
    if (!previous?.length) {
      return
    }

    const catalog = container.resolve<PartsCatalogModuleService>(
      PARTS_CATALOG_MODULE
    )
    await catalog.updateLookupTasks(previous)
  }
)

export type PrepareImportInput = {
  worker: string
  number: {
    brand: string
    number_type: NumberType
    number: string
  }
}

type PreparedImport = {
  task_id: string
  part_number_id?: string
  brand_id?: string
}

/**
 * Finds or creates the part number a bulk import is about and opens a task
 * for it that is already claimed, so the import does not go through the
 * lookup queue and no parser is asked about the number.
 */
export const prepareImportStep = createStep(
  "prepare-import",
  async (input: PrepareImportInput, { container }) => {
    const catalog = container.resolve<PartsCatalogModuleService>(
      PARTS_CATALOG_MODULE
    )
    const brandKey = normalizeBrandName(input.number.brand)
    const normalized = normalizePartNumber(input.number.number)

    if (!brandKey || !normalized) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Brand and number must contain letters or digits"
      )
    }

    const prepared: Partial<PreparedImport> = {}
    let brandId =
      (await catalog.listBrands({ normalized_name: brandKey }))[0]?.id ??
      (await catalog.listBrandAliasRecords({ normalized_alias: brandKey }))[0]
        ?.brand_id

    if (!brandId) {
      const brand = await catalog.createBrands({
        name: input.number.brand.trim(),
        normalized_name: brandKey,
        kind:
          input.number.number_type === "oem"
            ? "vehicle_manufacturer"
            : "parts_manufacturer",
      })
      brandId = brand.id
      prepared.brand_id = brand.id
    }

    let [partNumber] = await catalog.listPartNumbers({
      brand_id: brandId,
      number_type: input.number.number_type,
      normalized_number: normalized,
    })

    if (!partNumber) {
      partNumber = await catalog.createPartNumbers({
        brand_id: brandId,
        number_type: input.number.number_type,
        source_number: input.number.number,
        display_number: formatDisplayNumber(input.number.number),
        normalized_number: normalized,
      })
      prepared.part_number_id = partNumber.id
      await catalog.createPartNumberSearchKeys({
        key: normalized,
        part_number_id: partNumber.id,
      })
    }

    const task = await catalog.createLookupTasks({
      part_number_id: partNumber.id,
      status: "claimed",
      worker: input.worker,
      claimed_at: new Date(),
    })

    return new StepResponse(
      { task_id: task.id },
      { ...prepared, task_id: task.id } as PreparedImport
    )
  },
  async (prepared: PreparedImport | undefined, { container }) => {
    if (!prepared) {
      return
    }

    const catalog = container.resolve<PartsCatalogModuleService>(
      PARTS_CATALOG_MODULE
    )

    await catalog.deleteLookupTasks(prepared.task_id)

    if (prepared.part_number_id) {
      await catalog.deletePartNumbers(prepared.part_number_id)
    }

    if (prepared.brand_id) {
      await catalog.deleteBrands(prepared.brand_id)
    }
  }
)
