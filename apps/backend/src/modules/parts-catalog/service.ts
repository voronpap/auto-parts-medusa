import { MedusaService } from "@medusajs/framework/utils"
import Brand from "./models/brand"
import BrandAlias from "./models/brand-alias"
import LookupTask from "./models/lookup-task"
import Observation from "./models/observation"
import PartApplication from "./models/part-application"
import PartAttribute from "./models/part-attribute"
import PartNumber from "./models/part-number"
import PartNumberSearchKey from "./models/part-number-search-key"
import PartRelationship from "./models/part-relationship"
import RelationshipEvidence from "./models/relationship-evidence"
import Source from "./models/source"

class PartsCatalogModuleService extends MedusaService({
  Brand,
  // Keyed as "record" because generated method names for a model ending in
  // "s" differ between the types (listBrandAlias) and runtime
  // (listBrandAliases).
  BrandAliasRecord: BrandAlias,
  PartNumber,
  PartNumberSearchKey,
  PartRelationship,
  RelationshipEvidence,
  Source,
  Observation,
  PartApplication,
  PartAttribute,
  LookupTask,
}) {}

export default PartsCatalogModuleService
