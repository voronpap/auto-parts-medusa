import { MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { normalizeBrandName } from "../../../modules/parts-catalog/utils/normalize"
import { SUPPLY_MODULE } from "../../../modules/supply"
import SupplyModuleService from "../../../modules/supply/service"

export type CreateSupplierInput = {
  name: string
  currency_code?: string
  lead_days?: number | null
  note?: string | null
}

export const createSupplierStep = createStep(
  "create-supplier",
  async (input: CreateSupplierInput, { container }) => {
    const supply = container.resolve<SupplyModuleService>(SUPPLY_MODULE)
    const name = input.name.trim()
    const normalizedName = normalizeBrandName(name)

    if (!normalizedName) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Supplier name must contain letters or digits"
      )
    }

    const [taken] = await supply.listSuppliers({ normalized_name: normalizedName })

    if (taken) {
      throw new MedusaError(
        MedusaError.Types.DUPLICATE_ERROR,
        `Supplier "${taken.name}" already exists`
      )
    }

    const supplier = await supply.createSuppliers({
      name,
      normalized_name: normalizedName,
      currency_code: (input.currency_code ?? "uah").toLowerCase(),
      lead_days: input.lead_days ?? null,
      note: input.note?.trim() || null,
    })

    return new StepResponse(supplier, supplier.id)
  },
  async (supplierId: string | undefined, { container }) => {
    if (supplierId) {
      await container
        .resolve<SupplyModuleService>(SUPPLY_MODULE)
        .deleteSuppliers(supplierId)
    }
  }
)

export const deleteSupplierStep = createStep(
  "delete-supplier",
  async ({ id }: { id: string }, { container }) => {
    const supply = container.resolve<SupplyModuleService>(SUPPLY_MODULE)
    const [offer] = await supply.listSupplierOffers({ supplier_id: id }, { take: 1 })

    // Offers carry the price history; it is not thrown away with one click.
    if (offer) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "This supplier has offers; deactivate the supplier instead of deleting it"
      )
    }

    await supply.softDeleteSuppliers(id)

    return new StepResponse({ id }, id)
  },
  async (id: string | undefined, { container }) => {
    if (id) {
      await container.resolve<SupplyModuleService>(SUPPLY_MODULE).restoreSuppliers(id)
    }
  }
)
