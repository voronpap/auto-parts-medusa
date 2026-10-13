import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { PARTS_CATALOG_MODULE } from "../../../../modules/parts-catalog"
import PartsCatalogModuleService from "../../../../modules/parts-catalog/service"
import { archiveSourceDocumentsWorkflow } from "../../../../workflows/parts-catalog"
import { ArchiveDocumentsBody, ListDocumentsQuery } from "../middlewares"

// Everything about a kept response except the response itself.
const SUMMARY_FIELDS = [
  "id",
  "source_key",
  "source_name",
  "parser_name",
  "parser_version",
  "brand",
  "number",
  "part_number_id",
  "method",
  "url",
  "http_status",
  "body_bytes",
  "fetched_at",
  "last_seen_at",
] as const

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const catalog = req.scope.resolve<PartsCatalogModuleService>(
    PARTS_CATALOG_MODULE
  )
  const { limit, offset, part_number_id, source_key } =
    req.validatedQuery as ListDocumentsQuery
  const [documents, count] = await catalog.listAndCountSourceDocuments(
    {
      ...(part_number_id ? { part_number_id } : {}),
      ...(source_key ? { source_key } : {}),
    },
    {
      select: [...SUMMARY_FIELDS],
      take: limit,
      skip: offset,
      order: { fetched_at: "DESC" },
    }
  )

  return res.status(200).json({ documents, count, limit, offset })
}

export async function POST(
  req: AuthenticatedMedusaRequest<ArchiveDocumentsBody>,
  res: MedusaResponse
) {
  const { result } = await archiveSourceDocumentsWorkflow(req.scope).run({
    input: req.validatedBody,
  })

  return res.status(200).json(result)
}
