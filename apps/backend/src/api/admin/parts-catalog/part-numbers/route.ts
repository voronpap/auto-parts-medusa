import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { PARTS_CATALOG_MODULE } from "../../../../modules/parts-catalog"
import PartsCatalogModuleService from "../../../../modules/parts-catalog/service"
import { normalizePartNumber } from "../../../../modules/parts-catalog/utils/normalize"
import { createPartNumberWorkflow } from "../../../../workflows/parts-catalog"
import { CreatePartNumberBody, ListCatalogQuery } from "../middlewares"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const catalog = req.scope.resolve<PartsCatalogModuleService>(
    PARTS_CATALOG_MODULE
  )
  const { limit, offset, q } = req.validatedQuery as ListCatalogQuery
  const key = q ? normalizePartNumber(q).replace(/[%_]/g, "") : ""
  let ids: string[] | undefined
  let count = 0

  if (q) {
    // Prefix match on the normalized key, so spacing, hyphens and case in the
    // query do not matter and the index is used.
    const [keys, total] = key
      ? await catalog.listAndCountPartNumberSearchKeys(
          { key: { $like: `${key}%` } },
          {
            select: ["id", "key", "part_number_id"],
            take: limit,
            skip: offset,
            order: { key: "ASC" },
          }
        )
      : [[], 0]

    ids = [...new Set(keys.map((item) => item.part_number_id))]
    count = total
  }

  const [partNumbers, total] = ids
    ? [
        ids.length
          ? await catalog.listPartNumbers(
              { id: ids },
              { relations: ["brand"], order: { normalized_number: "ASC" } }
            )
          : [],
        count,
      ]
    : await catalog.listAndCountPartNumbers(
        {},
        {
          take: limit,
          skip: offset,
          relations: ["brand"],
          order: { created_at: "DESC" },
        }
      )

  const listedIds = partNumbers.map((partNumber) => partNumber.id)
  const relationships = listedIds.length
    ? await catalog.listPartRelationships(
        {
          $or: [
            { from_part_number_id: listedIds },
            { to_part_number_id: listedIds },
          ],
        },
        { select: ["id", "from_part_number_id", "to_part_number_id"] }
      )
    : []
  const relationshipCounts = new Map<string, number>()

  for (const relationship of relationships) {
    for (const id of [
      relationship.from_part_number_id,
      relationship.to_part_number_id,
    ]) {
      if (id) {
        relationshipCounts.set(id, (relationshipCounts.get(id) ?? 0) + 1)
      }
    }
  }

  return res.status(200).json({
    part_numbers: partNumbers.map((partNumber) => ({
      ...partNumber,
      relationship_count: relationshipCounts.get(partNumber.id) ?? 0,
    })),
    count: total,
    limit,
    offset,
  })
}

export async function POST(
  req: AuthenticatedMedusaRequest<CreatePartNumberBody>,
  res: MedusaResponse
) {
  const { result } = await createPartNumberWorkflow(req.scope).run({
    input: req.validatedBody,
  })

  return res.status(200).json({ part_number: result })
}
