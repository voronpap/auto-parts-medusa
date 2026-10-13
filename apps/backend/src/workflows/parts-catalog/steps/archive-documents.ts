import { createHash } from "crypto"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { PARTS_CATALOG_MODULE } from "../../../modules/parts-catalog"
import { NumberType } from "../../../modules/parts-catalog/constants"
import PartsCatalogModuleService from "../../../modules/parts-catalog/service"
import {
  normalizeBrandName,
  normalizePartNumber,
} from "../../../modules/parts-catalog/utils/normalize"

export type ArchiveDocument = {
  source_key: string
  source_name?: string | null
  parser_name?: string | null
  parser_version?: string | null
  request_key: string
  method?: string | null
  url: string
  params?: Record<string, unknown> | null
  http_status?: number | null
  body: string
  fetched_at?: string | null
}

export type ArchiveDocumentsInput = {
  number?: { brand: string; number_type: NumberType; number: string } | null
  documents: ArchiveDocument[]
}

type Archived = {
  created_ids: string[]
  touched: { id: string; last_seen_at: Date; part_number_id: string | null }[]
}

/**
 * Keeps raw responses of sources. Content already kept for the same request
 * is only marked as seen again; changed content becomes a new version.
 */
export const archiveSourceDocumentsStep = createStep(
  "archive-source-documents",
  async (input: ArchiveDocumentsInput, { container }) => {
    const catalog = container.resolve<PartsCatalogModuleService>(
      PARTS_CATALOG_MODULE
    )
    const archived: Archived = { created_ids: [], touched: [] }
    let partNumberId: string | null = null

    if (input.number) {
      const key = normalizeBrandName(input.number.brand)
      const [byName] = await catalog.listBrands({ normalized_name: key })
      const [byAlias] = byName
        ? []
        : await catalog.listBrandAliasRecords({ normalized_alias: key })
      const brandId = byName?.id ?? byAlias?.brand_id

      if (brandId) {
        const [partNumber] = await catalog.listPartNumbers({
          brand_id: brandId,
          number_type: input.number.number_type,
          normalized_number: normalizePartNumber(input.number.number),
        })
        partNumberId = partNumber?.id ?? null
      }
    }

    const now = new Date()
    const seen = new Set<string>()

    for (const document of input.documents) {
      const sha = createHash("sha256").update(document.body, "utf8").digest("hex")
      const version = `${document.request_key}|${sha}`

      // The same response may be sent twice in one batch.
      if (seen.has(version)) {
        continue
      }

      seen.add(version)

      const [existing] = await catalog.listSourceDocuments(
        { request_key: document.request_key, body_sha256: sha },
        { select: ["id", "last_seen_at", "part_number_id"], take: 1 }
      )

      if (existing) {
        archived.touched.push({
          id: existing.id,
          last_seen_at: existing.last_seen_at,
          part_number_id: existing.part_number_id,
        })
        await catalog.updateSourceDocuments({
          id: existing.id,
          last_seen_at: now,
          part_number_id: existing.part_number_id ?? partNumberId,
        })
        continue
      }

      const fetchedAt = document.fetched_at ? new Date(document.fetched_at) : now
      const created = await catalog.createSourceDocuments({
        source_key: document.source_key,
        source_name: document.source_name ?? null,
        parser_name: document.parser_name ?? null,
        parser_version: document.parser_version ?? null,
        brand: input.number?.brand ?? null,
        number: input.number?.number ?? null,
        part_number_id: partNumberId,
        request_key: document.request_key,
        method: document.method || "GET",
        url: document.url,
        params: document.params ?? null,
        http_status: document.http_status ?? null,
        body: document.body,
        body_sha256: sha,
        body_bytes: Buffer.byteLength(document.body, "utf8"),
        fetched_at: Number.isNaN(fetchedAt.getTime()) ? now : fetchedAt,
        last_seen_at: now,
      })
      archived.created_ids.push(created.id)
    }

    return new StepResponse(
      {
        stored: archived.created_ids.length,
        unchanged: archived.touched.length,
      },
      archived
    )
  },
  async (archived: Archived | undefined, { container }) => {
    if (!archived) {
      return
    }

    const catalog = container.resolve<PartsCatalogModuleService>(
      PARTS_CATALOG_MODULE
    )

    if (archived.created_ids.length) {
      await catalog.deleteSourceDocuments(archived.created_ids)
    }

    for (const item of archived.touched) {
      await catalog.updateSourceDocuments(item)
    }
  }
)
