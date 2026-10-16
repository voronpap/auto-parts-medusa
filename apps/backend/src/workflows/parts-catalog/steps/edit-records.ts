import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import productVariantPartNumber from "../../../links/product-variant-part-number"
import { PARTS_CATALOG_MODULE } from "../../../modules/parts-catalog"
import {
  ApplicabilityVerdict,
  BrandKind,
  RelationshipState,
} from "../../../modules/parts-catalog/constants"
import PartsCatalogModuleService from "../../../modules/parts-catalog/service"
import { normalizeBrandName } from "../../../modules/parts-catalog/utils/normalize"
import { getVerdictViolation } from "../../../modules/parts-catalog/utils/verdict"

const resolveCatalog = (container: {
  resolve: <T>(key: string) => T
}): PartsCatalogModuleService =>
  container.resolve<PartsCatalogModuleService>(PARTS_CATALOG_MODULE)

// ---- Brand ---------------------------------------------------------------

export type UpdateBrandInput = {
  id: string
  name?: string
  kind?: BrandKind
  /** The full list the brand should answer to; omitted leaves aliases alone. */
  aliases?: string[]
}

type BrandSnapshot = {
  id: string
  name: string
  normalized_name: string
  kind: BrandKind
  created_alias_ids: string[]
  removed_alias_ids: string[]
}

export const updatePartsBrandStep = createStep(
  "update-parts-brand",
  async (input: UpdateBrandInput, { container }) => {
    const catalog = resolveCatalog(container)
    const brand = await catalog.retrieveBrand(input.id, {
      relations: ["aliases"],
    })
    const name = input.name?.trim() || brand.name
    const normalizedName = normalizeBrandName(name)

    if (!normalizedName) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Brand name must contain letters or digits"
      )
    }

    const wanted = new Map<string, string>()

    for (const raw of input.aliases ??
      brand.aliases.map((alias) => alias.alias)) {
      const alias = raw.trim()
      const normalized = normalizeBrandName(alias)

      // An alias equal to the name adds nothing.
      if (normalized && normalized !== normalizedName) {
        wanted.set(normalized, alias)
      }
    }

    const current = new Map(
      brand.aliases.map((alias) => [alias.normalized_alias, alias])
    )
    const toCreate = [...wanted].filter(([normalized]) => !current.has(normalized))
    const toRemove = [...current.values()].filter(
      (alias) => !wanted.has(alias.normalized_alias)
    )
    const keys = [
      ...(normalizedName !== brand.normalized_name ? [normalizedName] : []),
      ...toCreate.map(([normalized]) => normalized),
    ]

    if (keys.length) {
      const [takenNames, takenAliases] = await Promise.all([
        catalog.listBrands({ normalized_name: keys }),
        catalog.listBrandAliasRecords({ normalized_alias: keys }),
      ])
      const clash =
        takenNames.find((other) => other.id !== brand.id)?.name ??
        takenAliases.find((alias) => alias.brand_id !== brand.id)?.alias

      if (clash) {
        throw new MedusaError(
          MedusaError.Types.DUPLICATE_ERROR,
          `Another brand already answers to "${clash}"; merge the brands instead`
        )
      }
    }

    const snapshot: BrandSnapshot = {
      id: brand.id,
      name: brand.name,
      normalized_name: brand.normalized_name,
      kind: brand.kind,
      created_alias_ids: [],
      removed_alias_ids: toRemove.map((alias) => alias.id),
    }

    // Removed aliases go first, so a name that was an alias becomes free.
    if (toRemove.length) {
      await catalog.softDeleteBrandAliasRecords(snapshot.removed_alias_ids)
    }

    const updated = await catalog.updateBrands({
      id: brand.id,
      name,
      normalized_name: normalizedName,
      kind: input.kind ?? brand.kind,
    })

    if (toCreate.length) {
      const created = await catalog.createBrandAliasRecords(
        toCreate.map(([normalized, alias]) => ({
          alias,
          normalized_alias: normalized,
          brand_id: brand.id,
        }))
      )
      snapshot.created_alias_ids = created.map((alias) => alias.id)
    }

    return new StepResponse(updated, snapshot)
  },
  async (snapshot: BrandSnapshot | undefined, { container }) => {
    if (!snapshot) {
      return
    }

    const catalog = resolveCatalog(container)

    if (snapshot.created_alias_ids.length) {
      await catalog.deleteBrandAliasRecords(snapshot.created_alias_ids)
    }

    await catalog.updateBrands({
      id: snapshot.id,
      name: snapshot.name,
      normalized_name: snapshot.normalized_name,
      kind: snapshot.kind,
    })

    if (snapshot.removed_alias_ids.length) {
      await catalog.restoreBrandAliasRecords(snapshot.removed_alias_ids)
    }
  }
)

// ---- Relationship ----------------------------------------------------------

export type UpdatePartRelationshipInput = {
  id: string
  applicability_verdict?: ApplicabilityVerdict
  relationship_state?: RelationshipState
  reason?: string | null
}

type RelationshipSnapshot = {
  id: string
  applicability_verdict: ApplicabilityVerdict
  relationship_state: RelationshipState
  reason: string | null
}

export const updatePartRelationshipStep = createStep(
  "update-part-relationship",
  async (input: UpdatePartRelationshipInput, { container }) => {
    const catalog = resolveCatalog(container)
    const relationship = await catalog.retrievePartRelationship(input.id, {
      relations: ["evidence", "evidence.observation", "evidence.observation.source"],
    })
    const verdict = input.applicability_verdict ?? relationship.applicability_verdict
    const reason =
      input.reason !== undefined ? input.reason?.trim() || null : relationship.reason
    // The same rule as on creation: a person cannot accept what no
    // authoritative source states.
    const violation = getVerdictViolation({
      verdict,
      relation_type: relationship.relation_type,
      reason,
      evidence: relationship.evidence.flatMap((item) =>
        item.observation?.source
          ? [
              {
                source_kind: item.observation.source.kind,
                lineage: item.observation.source.lineage,
                status: item.observation.status,
              },
            ]
          : []
      ),
    })

    if (violation) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, violation)
    }

    const snapshot: RelationshipSnapshot = {
      id: relationship.id,
      applicability_verdict: relationship.applicability_verdict,
      relationship_state: relationship.relationship_state,
      reason: relationship.reason,
    }
    const updated = await catalog.updatePartRelationships({
      id: relationship.id,
      applicability_verdict: verdict,
      relationship_state:
        input.relationship_state ?? relationship.relationship_state,
      reason,
    })

    return new StepResponse(updated, snapshot)
  },
  async (snapshot: RelationshipSnapshot | undefined, { container }) => {
    if (snapshot) {
      await resolveCatalog(container).updatePartRelationships(snapshot)
    }
  }
)

// ---- Merging brands --------------------------------------------------------

export type MergeBrandsInput = {
  source_id: string
  target_id: string
}

type NumberMerge = {
  old_id: string
  new_id: string
  moved_relationships: { id: string; from: string; to: string | null }[]
  folded_relationship_ids: string[]
  moved_evidence: { id: string; relationship_id: string }[]
  application_ids: string[]
  attribute_ids: string[]
  image_ids: string[]
  task_ids: string[]
  linked_variant_ids: string[]
  dismissed_variant_ids: string[]
}

type BrandMerge = {
  source_id: string
  target_id: string
  moved_number_ids: string[]
  number_merges: NumberMerge[]
  alias_ids: string[]
}

const CHUNK = 500

const chunks = <T>(items: T[]): T[][] =>
  Array.from({ length: Math.ceil(items.length / CHUNK) }, (_, index) =>
    items.slice(index * CHUNK, (index + 1) * CHUNK)
  )

const linkOf = (variantId: string, partNumberId: string) => ({
  [Modules.PRODUCT]: { product_variant_id: variantId },
  [PARTS_CATALOG_MODULE]: { part_number_id: partNumberId },
})

/**
 * Folds one brand into another. Numbers only the source has change brand;
 * a number both have is merged into the target's: its crosses, fitment,
 * characteristics, lookup tasks and product links move over. The source's
 * name and aliases become aliases of the target.
 */
export const mergePartsBrandsStep = createStep(
  "merge-parts-brands",
  async (input: MergeBrandsInput, { container }) => {
    const catalog = resolveCatalog(container)
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const link = container.resolve(ContainerRegistrationKeys.LINK)

    if (input.source_id === input.target_id) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "A brand cannot be merged into itself"
      )
    }

    const [source, target] = await Promise.all([
      catalog.retrieveBrand(input.source_id, { relations: ["aliases"] }),
      catalog.retrieveBrand(input.target_id, { relations: ["aliases"] }),
    ])
    const merge: BrandMerge = {
      source_id: source.id,
      target_id: target.id,
      moved_number_ids: [],
      number_merges: [],
      alias_ids: [],
    }
    const sourceNumbers = await catalog.listPartNumbers(
      { brand_id: source.id },
      { select: ["id", "number_type", "normalized_number"], take: null }
    )
    const twins = new Map<string, string>()

    for (const batch of chunks(sourceNumbers)) {
      const found = await catalog.listPartNumbers(
        {
          brand_id: target.id,
          normalized_number: batch.map((number) => number.normalized_number),
        },
        { select: ["id", "number_type", "normalized_number"], take: null }
      )

      for (const number of found) {
        twins.set(`${number.number_type}|${number.normalized_number}`, number.id)
      }
    }

    try {
      for (const number of sourceNumbers) {
        const twinId = twins.get(
          `${number.number_type}|${number.normalized_number}`
        )

        if (!twinId) {
          merge.moved_number_ids.push(number.id)
          continue
        }

        const item: NumberMerge = {
          old_id: number.id,
          new_id: twinId,
          moved_relationships: [],
          folded_relationship_ids: [],
          moved_evidence: [],
          application_ids: [],
          attribute_ids: [],
          image_ids: [],
          task_ids: [],
          linked_variant_ids: [],
          dismissed_variant_ids: [],
        }
        merge.number_merges.push(item)

        const [outgoing, incoming] = await Promise.all([
          catalog.listPartRelationships(
            { from_part_number_id: number.id },
            { relations: ["evidence"], take: null }
          ),
          catalog.listPartRelationships(
            { to_part_number_id: number.id },
            { relations: ["evidence"], take: null }
          ),
        ])

        for (const relationship of [...outgoing, ...incoming]) {
          const from =
            relationship.from_part_number_id === number.id
              ? twinId
              : relationship.from_part_number_id
          const to =
            relationship.to_part_number_id === number.id
              ? twinId
              : relationship.to_part_number_id
          const [existing] =
            from === to
              ? []
              : await catalog.listPartRelationships(
                  {
                    from_part_number_id: from,
                    to_part_number_id: to,
                    relation_type: relationship.relation_type,
                  },
                  { relations: ["evidence"], take: 1 }
                )

          if (from !== to && !existing) {
            await catalog.updatePartRelationships({
              id: relationship.id,
              from_part_number_id: from,
              to_part_number_id: to,
            })
            item.moved_relationships.push({
              id: relationship.id,
              from: relationship.from_part_number_id,
              to: relationship.to_part_number_id,
            })
            continue
          }

          // The target already states this (or it would point at itself):
          // its evidence joins the existing relationship and the copy goes.
          if (existing) {
            const known = new Set(
              existing.evidence.map((evidence) => evidence.observation_id)
            )
            const moving = relationship.evidence.filter(
              (evidence) => !known.has(evidence.observation_id)
            )

            if (moving.length) {
              await catalog.updateRelationshipEvidences({
                selector: { id: moving.map((evidence) => evidence.id) },
                data: { relationship_id: existing.id },
              })
              item.moved_evidence.push(
                ...moving.map((evidence) => ({
                  id: evidence.id,
                  relationship_id: relationship.id,
                }))
              )
            }
          }

          await catalog.softDeletePartRelationships(relationship.id)
          item.folded_relationship_ids.push(relationship.id)
        }

        const [applications, attributes, images, tasks] = await Promise.all([
          catalog.listPartApplications(
            { part_number_id: number.id },
            { select: ["id"], take: null }
          ),
          catalog.listPartAttributes(
            { part_number_id: number.id },
            { select: ["id"], take: null }
          ),
          catalog.listPartImages(
            { part_number_id: number.id },
            { select: ["id"], take: null }
          ),
          catalog.listLookupTasks(
            { part_number_id: number.id },
            { select: ["id"], take: null }
          ),
        ])
        item.application_ids = applications.map((row) => row.id)
        item.attribute_ids = attributes.map((row) => row.id)
        item.image_ids = images.map((row) => row.id)
        item.task_ids = tasks.map((row) => row.id)

        if (item.application_ids.length) {
          await catalog.updatePartApplications({
            selector: { id: item.application_ids },
            data: { part_number_id: twinId },
          })
        }

        if (item.attribute_ids.length) {
          await catalog.updatePartAttributes({
            selector: { id: item.attribute_ids },
            data: { part_number_id: twinId },
          })
        }

        if (item.image_ids.length) {
          await catalog.updatePartImages({
            selector: { id: item.image_ids },
            data: { part_number_id: twinId },
          })
        }

        if (item.task_ids.length) {
          await catalog.updateLookupTasks({
            selector: { id: item.task_ids },
            data: { part_number_id: twinId },
          })
        }

        const { data: links } = await query.graph({
          entity: productVariantPartNumber.entryPoint,
          fields: ["product_variant_id", "part_number_id"],
          filters: { part_number_id: [number.id, twinId] },
        })
        const alreadyLinked = new Set(
          links
            .filter((row) => row.part_number_id === twinId)
            .map((row) => row.product_variant_id)
        )

        for (const row of links) {
          if (row.part_number_id !== number.id) {
            continue
          }

          if (!alreadyLinked.has(row.product_variant_id)) {
            await link.create(linkOf(row.product_variant_id, twinId))
            item.linked_variant_ids.push(row.product_variant_id)
          }

          await link.dismiss(linkOf(row.product_variant_id, number.id))
          item.dismissed_variant_ids.push(row.product_variant_id)
        }

        await catalog.softDeletePartNumbers(number.id)
      }

      for (const batch of chunks(merge.moved_number_ids)) {
        await catalog.updatePartNumbers({
          selector: { id: batch },
          data: { brand_id: target.id },
        })
      }

      const known = new Set([
        target.normalized_name,
        ...target.aliases.map((alias) => alias.normalized_alias),
      ])
      const incomingAliases = [
        { alias: source.name, normalized_alias: source.normalized_name },
        ...source.aliases.map((alias) => ({
          alias: alias.alias,
          normalized_alias: alias.normalized_alias,
        })),
      ].filter((alias) => !known.has(alias.normalized_alias))

      // The source goes first so its aliases stop being live before the
      // target takes over the same spellings.
      await catalog.softDeleteBrands(source.id)

      if (incomingAliases.length) {
        const created = await catalog.createBrandAliasRecords(
          incomingAliases.map((alias) => ({ ...alias, brand_id: target.id }))
        )
        merge.alias_ids = created.map((alias) => alias.id)
      }
    } catch (error) {
      // What was done before the failure must be undone as well.
      await undoBrandMerge(container, merge)
      throw error
    }

    return new StepResponse(
      {
        id: target.id,
        numbers_moved: merge.moved_number_ids.length,
        numbers_merged: merge.number_merges.length,
      },
      merge
    )
  },
  async (merge: BrandMerge | undefined, { container }) => {
    if (merge) {
      await undoBrandMerge(container, merge)
    }
  }
)

async function undoBrandMerge(
  container: { resolve: <T>(key: string) => T },
  merge: BrandMerge
) {
  const catalog = resolveCatalog(container)
  const link = container.resolve<{
    create: (data: unknown) => Promise<unknown>
    dismiss: (data: unknown) => Promise<unknown>
  }>(ContainerRegistrationKeys.LINK)

  if (merge.alias_ids.length) {
    await catalog.deleteBrandAliasRecords(merge.alias_ids)
  }

  await catalog.restoreBrands(merge.source_id)

  for (const batch of chunks(merge.moved_number_ids)) {
    const stillMoved = await catalog.listPartNumbers(
      { id: batch, brand_id: merge.target_id },
      { select: ["id"], take: null }
    )

    if (stillMoved.length) {
      await catalog.updatePartNumbers({
        selector: { id: stillMoved.map((number) => number.id) },
        data: { brand_id: merge.source_id },
      })
    }
  }

  for (const item of [...merge.number_merges].reverse()) {
    await catalog.restorePartNumbers(item.old_id)

    for (const variantId of item.dismissed_variant_ids) {
      await link.create(linkOf(variantId, item.old_id))
    }

    for (const variantId of item.linked_variant_ids) {
      await link.dismiss(linkOf(variantId, item.new_id))
    }

    if (item.task_ids.length) {
      await catalog.updateLookupTasks({
        selector: { id: item.task_ids },
        data: { part_number_id: item.old_id },
      })
    }

    if (item.attribute_ids.length) {
      await catalog.updatePartAttributes({
        selector: { id: item.attribute_ids },
        data: { part_number_id: item.old_id },
      })
    }

    if (item.image_ids.length) {
      await catalog.updatePartImages({
        selector: { id: item.image_ids },
        data: { part_number_id: item.old_id },
      })
    }

    if (item.application_ids.length) {
      await catalog.updatePartApplications({
        selector: { id: item.application_ids },
        data: { part_number_id: item.old_id },
      })
    }

    if (item.folded_relationship_ids.length) {
      await catalog.restorePartRelationships(item.folded_relationship_ids)
    }

    for (const evidence of item.moved_evidence) {
      await catalog.updateRelationshipEvidences({
        id: evidence.id,
        relationship_id: evidence.relationship_id,
      })
    }

    for (const relationship of item.moved_relationships) {
      await catalog.updatePartRelationships({
        id: relationship.id,
        from_part_number_id: relationship.from,
        to_part_number_id: relationship.to,
      })
    }
  }
}

// ---- Looking product numbers up again --------------------------------------

/**
 * Queues every part number that a product variant carries for the parser
 * service, unless it is already waiting. New sources and new kinds of search
 * only reach numbers that are looked up after they appear.
 */
export const requeueProductNumbersStep = createStep(
  "requeue-product-numbers",
  async (_: Record<string, never>, { container }) => {
    const catalog = resolveCatalog(container)
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data: links } = await query.graph({
      entity: productVariantPartNumber.entryPoint,
      fields: ["part_number_id"],
    })
    const numberIds = [...new Set(links.map((row) => row.part_number_id))]
    const waiting = new Set<string>()

    for (const batch of chunks(numberIds)) {
      const tasks = await catalog.listLookupTasks(
        { part_number_id: batch, status: ["pending", "claimed"] },
        { select: ["part_number_id"], take: null }
      )

      for (const task of tasks) {
        waiting.add(task.part_number_id)
      }
    }

    const toQueue = numberIds.filter((id) => !waiting.has(id))
    const created = toQueue.length
      ? await catalog.createLookupTasks(
          toQueue.map((id) => ({ part_number_id: id, status: "pending" as const }))
        )
      : []

    return new StepResponse(
      { queued: created.length, already_waiting: waiting.size },
      created.map((task) => task.id)
    )
  },
  async (taskIds: string[] | undefined, { container }) => {
    if (taskIds?.length) {
      await resolveCatalog(container).deleteLookupTasks(taskIds)
    }
  }
)
