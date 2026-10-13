import { Module } from "@medusajs/framework/utils"
import SupplyModuleService from "./service"

export const SUPPLY_MODULE = "supply"

export default Module(SUPPLY_MODULE, {
  service: SupplyModuleService,
})
