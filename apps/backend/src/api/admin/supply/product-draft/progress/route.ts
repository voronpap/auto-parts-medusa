import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { PARTS_CATALOG_MODULE } from "../../../../../modules/parts-catalog"
import PartsCatalogModuleService from "../../../../../modules/parts-catalog/service"
import { ProductDraftProgressQuery } from "../../middlewares"

/**
 * How far the parsers are with a number: its place in the queue and what
 * the catalog already holds for it.
 */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const { part_number_id: id } = req.validatedQuery as ProductDraftProgressQuery
  const catalog = req.scope.resolve<PartsCatalogModuleService>(PARTS_CATALOG_MODULE)
  const [task] = await catalog.listLookupTasks(
    { part_number_id: id },
    { order: { created_at: "DESC" }, take: 1 }
  )
  const [[, outgoing], [, incoming], [, applications], [, attributes]] =
    await Promise.all([
      catalog.listAndCountPartRelationships({ from_part_number_id: id }, { take: 1 }),
      catalog.listAndCountPartRelationships({ to_part_number_id: id }, { take: 1 }),
      catalog.listAndCountPartApplications({ part_number_id: id }, { take: 1 }),
      catalog.listAndCountPartAttributes({ part_number_id: id }, { take: 1 }),
    ])
  const ahead =
    task?.status === "pending"
      ? (
          await catalog.listAndCountLookupTasks(
            { status: "pending", created_at: { $lt: task.created_at } },
            { take: 1 }
          )
        )[1]
      : 0

  return res.status(200).json({
    task: task
      ? {
          status: task.status,
          ahead,
          errors: (
            (task.errors as unknown as { source?: string | null; message: string }[] | null) ?? []
          ).slice(0, 10),
        }
      : null,
    relationships: outgoing + incoming,
    applications,
    attributes,
  })
}
