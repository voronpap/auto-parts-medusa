import { MedusaService } from "@medusajs/framework/utils"
import Brand from "./models/brand"
import BrandAlias from "./models/brand-alias"
import Observation from "./models/observation"
import PartNumber from "./models/part-number"
import PartNumberSearchKey from "./models/part-number-search-key"
import PartRelationship from "./models/part-relationship"
import RelationshipEvidence from "./models/relationship-evidence"
import Source from "./models/source"

class PartsCatalogModuleService extends MedusaService({
  Brand,
  BrandAlias,
  PartNumber,
  PartNumberSearchKey,
  PartRelationship,
  RelationshipEvidence,
  Source,
  Observation,
}) {}

export default PartsCatalogModuleService
