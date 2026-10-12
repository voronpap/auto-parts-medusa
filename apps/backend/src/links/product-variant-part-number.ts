import { defineLink } from "@medusajs/framework/utils"
import ProductModule from "@medusajs/medusa/product"
import PartsCatalogModule from "../modules/parts-catalog"

// A variant's SKU is a part number in the catalog. A variant may carry more
// than one number (article and EAN), hence the list.
export default defineLink(ProductModule.linkable.productVariant, {
  linkable: PartsCatalogModule.linkable.partNumber,
  isList: true,
})
