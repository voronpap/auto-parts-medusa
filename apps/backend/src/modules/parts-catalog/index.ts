import { Module } from "@medusajs/framework/utils"
import PartsCatalogModuleService from "./service"

export const PARTS_CATALOG_MODULE = "partsCatalog"

export default Module(PARTS_CATALOG_MODULE, {
  service: PartsCatalogModuleService,
})
