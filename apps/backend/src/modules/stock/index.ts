import { Module } from "@medusajs/framework/utils"
import StockModuleService from "./service"

export const STOCK_MODULE = "stock"

export default Module(STOCK_MODULE, {
  service: StockModuleService,
})
