import { MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { PARTS_CATALOG_MODULE } from "../../../modules/parts-catalog"
import PartsCatalogModuleService from "../../../modules/parts-catalog/service"
import { normalizePartNumber } from "../../../modules/parts-catalog/utils/normalize"

// An answer of the sources is good for this long before they are asked again.
const ANSWER_TTL_MS = 24 * 60 * 60 * 1000
// A question nobody picked up in this time is put again.
const PENDING_TTL_MS = 2 * 60 * 1000

export type NumberSearchCandidate = {
  brand: string
  number: string
  title?: string | null
  source: string
}

export type CompleteNumberSearchInput = {
  id: string
  worker?: string | null
  candidates: NumberSearchCandidate[]
  errors: { source?: string | null; message: string }[]
}

/** Asks the parser service whose part a number is, unless it was just asked. */
export const startNumberSearchStep = createStep(
  "start-number-search",
  async (input: { query: string }, { container }) => {
    const catalog = container.resolve<PartsCatalogModuleService>(
      PARTS_CATALOG_MODULE
    )
    const normalized = normalizePartNumber(input.query)

    if (!normalized) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "A number is required")
    }

    const [latest] = await catalog.listNumberSearches(
      { normalized_number: normalized },
      { order: { created_at: "DESC" }, take: 1 }
    )
    const age = latest ? Date.now() - new Date(latest.created_at).getTime() : Infinity

    if (
      latest &&
      // An empty answer is not kept: the sources are asked again, since a
      // parser added since then may know the number.
      ((latest.status === "done" &&
        age < ANSWER_TTL_MS &&
        Array.isArray(latest.candidates) &&
        latest.candidates.length > 0) ||
        (latest.status === "pending" && age < PENDING_TTL_MS))
    ) {
      // Nothing was created, so there is nothing to undo.
      return new StepResponse(latest, undefined as string | undefined)
    }

    const search = await catalog.createNumberSearches({
      query: input.query.trim(),
      normalized_number: normalized,
      status: "pending",
    })

    return new StepResponse(search, search.id as string | undefined)
  },
  async (id: string | undefined, { container }) => {
    if (id) {
      await container
        .resolve<PartsCatalogModuleService>(PARTS_CATALOG_MODULE)
        .deleteNumberSearches(id)
    }
  }
)

/** Stores the parser service's answer to a number search. */
export const completeNumberSearchStep = createStep(
  "complete-number-search",
  async (input: CompleteNumberSearchInput, { container }) => {
    const catalog = container.resolve<PartsCatalogModuleService>(
      PARTS_CATALOG_MODULE
    )
    const search = await catalog.retrieveNumberSearch(input.id)
    const previous = {
      id: search.id,
      status: search.status,
      candidates: search.candidates,
      errors: search.errors,
      worker: search.worker,
      completed_at: search.completed_at,
    }
    const updated = await catalog.updateNumberSearches({
      id: search.id,
      // Sources that all failed leave the question unanswered.
      status:
        input.errors.length && !input.candidates.length ? "failed" : "done",
      candidates: input.candidates as unknown as Record<string, unknown>,
      errors: input.errors as unknown as Record<string, unknown>,
      worker: input.worker ?? null,
      completed_at: new Date(),
    })

    return new StepResponse(updated, previous)
  },
  async (previous, { container }) => {
    if (previous) {
      await container
        .resolve<PartsCatalogModuleService>(PARTS_CATALOG_MODULE)
        .updateNumberSearches(previous as never)
    }
  }
)
