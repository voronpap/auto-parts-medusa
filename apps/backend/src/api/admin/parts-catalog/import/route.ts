import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { importPartNumberResultWorkflow } from "../../../../workflows/parts-catalog"
import { createImportIdempotencyIdentity } from "../../../../modules/parts-catalog/utils/import-idempotency"
import { ImportResultBody } from "../lookup-tasks/schemas"

type ReceiptRow = {
  id: string
  request_hash: string
  status: "processing" | "completed"
  response: Record<string, unknown> | null
  created_at: Date
}

type CatalogDatabase = {
  raw: (query: string, bindings?: unknown[]) => Promise<{ rows: ReceiptRow[] }>
}

// Loads what a catalogue read in bulk (a parsed PDF, say) states about one
// part number. The number is created if needed and no parser is queued.
//
// A receipt keyed by the number and a hash of the result makes a resent
// line harmless: a completed import answers with its stored response, one
// still running answers 409 and is not loaded twice.
export async function POST(
  req: AuthenticatedMedusaRequest<ImportResultBody>,
  res: MedusaResponse
) {
  const db = req.scope.resolve<CatalogDatabase>(
    ContainerRegistrationKeys.PG_CONNECTION
  )
  const { idempotencyKey, requestHash } = createImportIdempotencyIdentity(
    req.validatedBody
  )
  const delivery = req.validatedBody.delivery
  const inserted = await db.raw(
    `insert into "parts_import_receipt"
      ("id", "idempotency_key", "request_hash", "status", "source_file", "source_offset")
     values (?, ?, ?, 'processing', ?, ?)
     on conflict ("idempotency_key") do nothing
     returning "id"`,
    [
      `pimp_${idempotencyKey}`,
      idempotencyKey,
      requestHash,
      delivery?.spool_file ?? null,
      delivery ? String(delivery.byte_offset) : null,
    ]
  )

  if (!inserted.rows.length) {
    const existing = await db.raw(
      `select "id", "request_hash", "status", "response", "created_at"
       from "parts_import_receipt"
       where "idempotency_key" = ?
       limit 1`,
      [idempotencyKey]
    )
    const receipt = existing.rows[0]

    if (!receipt) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "Import idempotency receipt conflicted but could not be read"
      )
    }

    if (receipt.request_hash !== requestHash) {
      return res.status(409).json({
        message:
          "Import idempotency key collision; manual reconciliation required",
      })
    }

    if (receipt.status === "completed") {
      if (!receipt.response) {
        throw new MedusaError(
          MedusaError.Types.UNEXPECTED_STATE,
          "Completed import idempotency receipt has no response"
        )
      }

      return res.status(200).json(receipt.response)
    }

    return res.status(409).json({
      message: "An identical import is already processing",
      receipt_id: receipt.id,
      created_at: receipt.created_at,
    })
  }

  let result: unknown
  try {
    ;({ result } = await importPartNumberResultWorkflow(req.scope).run({
      input: req.validatedBody,
    }))
  } catch (error) {
    // The workflow rolled back, so nothing was loaded: drop the receipt and
    // let the line be sent again. Left behind it would answer 409 forever.
    await db.raw(
      `delete from "parts_import_receipt"
       where "idempotency_key" = ? and "status" = 'processing'`,
      [idempotencyKey]
    )
    throw error
  }

  const completed = await db.raw(
    `update "parts_import_receipt"
     set "status" = 'completed', "response" = ?::jsonb, "updated_at" = now()
     where "idempotency_key" = ? and "status" = 'processing'
     returning "id"`,
    [JSON.stringify(result), idempotencyKey]
  )

  if (!completed.rows.length) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "Import completed but its idempotency receipt was not finalized"
    )
  }

  return res.status(200).json(result)
}
