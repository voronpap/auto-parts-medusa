import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { STOCK_MODULE } from "../../../modules/stock"
import StockModuleService from "../../../modules/stock/service"

export type UpdateStockSettingsInput = {
  hold_minutes?: number
  backorder_label?: string
}

type Snapshot = { id: string; hold_minutes: number; backorder_label: string }

export const updateStockSettingsStep = createStep(
  "update-stock-settings",
  async (input: UpdateStockSettingsInput, { container }) => {
    const stock = container.resolve<StockModuleService>(STOCK_MODULE)
    const [current] = await stock.listStockSettings({}, { take: 1 })
    const row = current ?? (await stock.createStockSettings({}))
    const snapshot: Snapshot = {
      id: row.id,
      hold_minutes: row.hold_minutes,
      backorder_label: row.backorder_label,
    }
    const updated = await stock.updateStockSettings({
      id: row.id,
      ...(input.hold_minutes !== undefined ? { hold_minutes: input.hold_minutes } : {}),
      ...(input.backorder_label !== undefined
        ? { backorder_label: input.backorder_label }
        : {}),
    })

    return new StepResponse(updated, snapshot)
  },
  async (snapshot: Snapshot | undefined, { container }) => {
    if (snapshot) {
      await container.resolve<StockModuleService>(STOCK_MODULE).updateStockSettings(snapshot)
    }
  }
)
