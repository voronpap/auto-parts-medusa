import { MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { PARTS_CATALOG_MODULE } from "../../../modules/parts-catalog"
import PartsCatalogModuleService from "../../../modules/parts-catalog/service"
import { normalizeBrandName } from "../../../modules/parts-catalog/utils/normalize"

export type CreateVehicleMakeInput = {
  name: string
  aliases?: string[]
}

export type SeedVehicleMakesInput = {
  makes: CreateVehicleMakeInput[]
}

export type MergeVehiclesInput = {
  source_id: string
  target_id: string
}

type ModelMerge = {
  source_model_id: string
  target_model_id: string
  application_ids: string[]
  alias_ids: string[]
}

type MakeMerge = {
  source_make_id: string
  target_make_id: string
  moved_model_ids: string[]
  model_merges: ModelMerge[]
  application_ids: string[]
  alias_ids: string[]
}

const resolveCatalog = (container: {
  resolve: <T>(key: string) => T
}): PartsCatalogModuleService =>
  container.resolve<PartsCatalogModuleService>(PARTS_CATALOG_MODULE)

/**
 * Creates a make with its aliases unless a make already answers to one of
 * those names. Returns the id of the make it created, if any.
 */
async function createMakeIfAbsent(
  catalog: PartsCatalogModuleService,
  input: CreateVehicleMakeInput
): Promise<{ make_id?: string; conflict?: string }> {
  const name = input.name.trim()
  const normalizedName = normalizeBrandName(name)

  if (!normalizedName) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Vehicle make must contain letters or digits"
    )
  }

  const aliases = new Map<string, string>()

  for (const raw of input.aliases ?? []) {
    const normalized = normalizeBrandName(raw)

    if (normalized && normalized !== normalizedName) {
      aliases.set(normalized, raw.trim())
    }
  }

  const keys = [normalizedName, ...aliases.keys()]
  const [takenNames, takenAliases] = await Promise.all([
    catalog.listVehicleMakes({ normalized_name: keys }),
    catalog.listVehicleMakeAliasRecords({ normalized_alias: keys }),
  ])

  if (takenNames.length || takenAliases.length) {
    return { conflict: takenNames[0]?.name ?? takenAliases[0]?.alias }
  }

  const make = await catalog.createVehicleMakes({
    name,
    normalized_name: normalizedName,
  })

  if (aliases.size) {
    await catalog.createVehicleMakeAliasRecords(
      [...aliases].map(([normalized, alias]) => ({
        alias,
        normalized_alias: normalized,
        make_id: make.id,
      }))
    )
  }

  return { make_id: make.id }
}

export const createVehicleMakeStep = createStep(
  "create-vehicle-make",
  async (input: CreateVehicleMakeInput, { container }) => {
    const catalog = resolveCatalog(container)
    const { make_id: makeId, conflict } = await createMakeIfAbsent(
      catalog,
      input
    )

    if (!makeId) {
      throw new MedusaError(
        MedusaError.Types.DUPLICATE_ERROR,
        `A vehicle make or alias matching "${conflict}" already exists`
      )
    }

    return new StepResponse(await catalog.retrieveVehicleMake(makeId), makeId)
  },
  async (makeId: string | undefined, { container }) => {
    if (makeId) {
      await resolveCatalog(container).deleteVehicleMakes(makeId)
    }
  }
)

export const seedVehicleMakesStep = createStep(
  "seed-vehicle-makes",
  async ({ makes }: SeedVehicleMakesInput, { container }) => {
    const catalog = resolveCatalog(container)
    const createdIds: string[] = []

    for (const make of makes) {
      const { make_id: makeId } = await createMakeIfAbsent(catalog, make)

      if (makeId) {
        createdIds.push(makeId)
      }
    }

    return new StepResponse(
      { created: createdIds.length, skipped: makes.length - createdIds.length },
      createdIds
    )
  },
  async (createdIds: string[] | undefined, { container }) => {
    if (createdIds?.length) {
      await resolveCatalog(container).deleteVehicleMakes(createdIds)
    }
  }
)

/**
 * Folds one model into another of the same make: the source's name and
 * aliases become aliases of the target, its fitment rows point at the target,
 * and the source is soft deleted.
 */
async function mergeModelInto(
  catalog: PartsCatalogModuleService,
  sourceId: string,
  targetId: string
): Promise<ModelMerge> {
  const [source, target] = await Promise.all([
    catalog.retrieveVehicleModel(sourceId, { relations: ["aliases"] }),
    catalog.retrieveVehicleModel(targetId, { relations: ["aliases"] }),
  ])
  const known = new Set([
    target.normalized_name,
    ...target.aliases.map((alias) => alias.normalized_alias),
  ])
  const incoming = [
    { alias: source.name, normalized_alias: source.normalized_name },
    ...source.aliases.map((alias) => ({
      alias: alias.alias,
      normalized_alias: alias.normalized_alias,
    })),
  ].filter((alias) => {
    if (known.has(alias.normalized_alias)) {
      return false
    }

    known.add(alias.normalized_alias)

    return true
  })
  const applications = await catalog.listPartApplications(
    { vehicle_model_id: source.id },
    { select: ["id"], take: null }
  )
  const applicationIds = applications.map((application) => application.id)

  // The source goes first so its aliases stop being live before the target
  // takes over the same spellings.
  await catalog.softDeleteVehicleModels(source.id)

  const createdAliases = incoming.length
    ? await catalog.createVehicleModelAliasRecords(
        incoming.map((alias) => ({ ...alias, model_id: target.id }))
      )
    : []

  if (applicationIds.length) {
    await catalog.updatePartApplications({
      selector: { id: applicationIds },
      data: { vehicle_model_id: target.id },
    })
  }

  return {
    source_model_id: source.id,
    target_model_id: target.id,
    application_ids: applicationIds,
    alias_ids: createdAliases.map((alias) => alias.id),
  }
}

async function undoModelMerge(
  catalog: PartsCatalogModuleService,
  merge: ModelMerge
) {
  if (merge.alias_ids.length) {
    await catalog.deleteVehicleModelAliasRecords(merge.alias_ids)
  }

  await catalog.restoreVehicleModels(merge.source_model_id)

  if (merge.application_ids.length) {
    await catalog.updatePartApplications({
      selector: { id: merge.application_ids },
      data: { vehicle_model_id: merge.source_model_id },
    })
  }
}

export const mergeVehicleModelsStep = createStep(
  "merge-vehicle-models",
  async (input: MergeVehiclesInput, { container }) => {
    const catalog = resolveCatalog(container)

    if (input.source_id === input.target_id) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "A model cannot be merged into itself"
      )
    }

    const [source, target] = await Promise.all([
      catalog.retrieveVehicleModel(input.source_id),
      catalog.retrieveVehicleModel(input.target_id),
    ])

    if (source.make_id !== target.make_id) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Models of different makes cannot be merged"
      )
    }

    const merge = await mergeModelInto(catalog, source.id, target.id)

    return new StepResponse(
      { id: target.id, applications_moved: merge.application_ids.length },
      merge
    )
  },
  async (merge: ModelMerge | undefined, { container }) => {
    if (merge) {
      await undoModelMerge(resolveCatalog(container), merge)
    }
  }
)

export const mergeVehicleMakesStep = createStep(
  "merge-vehicle-makes",
  async (input: MergeVehiclesInput, { container }) => {
    const catalog = resolveCatalog(container)

    if (input.source_id === input.target_id) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "A make cannot be merged into itself"
      )
    }

    const [source, target] = await Promise.all([
      catalog.retrieveVehicleMake(input.source_id, {
        relations: ["aliases", "models"],
      }),
      catalog.retrieveVehicleMake(input.target_id, {
        relations: ["aliases", "models"],
      }),
    ])
    const merge: MakeMerge = {
      source_make_id: source.id,
      target_make_id: target.id,
      moved_model_ids: [],
      model_merges: [],
      application_ids: [],
      alias_ids: [],
    }
    const targetModels = new Map(
      target.models.map((model) => [model.normalized_name, model.id])
    )

    // A model the target already has is merged into it; the rest move over.
    for (const model of source.models) {
      const twinId = targetModels.get(model.normalized_name)

      if (twinId) {
        merge.model_merges.push(
          await mergeModelInto(catalog, model.id, twinId)
        )
      } else {
        await catalog.updateVehicleModels({ id: model.id, make_id: target.id })
        merge.moved_model_ids.push(model.id)
      }
    }

    const applications = await catalog.listPartApplications(
      { vehicle_make_id: source.id },
      { select: ["id"], take: null }
    )
    merge.application_ids = applications.map((application) => application.id)

    if (merge.application_ids.length) {
      await catalog.updatePartApplications({
        selector: { id: merge.application_ids },
        data: { vehicle_make_id: target.id },
      })
    }

    const known = new Set([
      target.normalized_name,
      ...target.aliases.map((alias) => alias.normalized_alias),
    ])
    const incoming = [
      { alias: source.name, normalized_alias: source.normalized_name },
      ...source.aliases.map((alias) => ({
        alias: alias.alias,
        normalized_alias: alias.normalized_alias,
      })),
    ].filter((alias) => !known.has(alias.normalized_alias))

    await catalog.softDeleteVehicleMakes(source.id)

    if (incoming.length) {
      const createdAliases = await catalog.createVehicleMakeAliasRecords(
        incoming.map((alias) => ({ ...alias, make_id: target.id }))
      )
      merge.alias_ids = createdAliases.map((alias) => alias.id)
    }

    return new StepResponse(
      {
        id: target.id,
        models_moved: merge.moved_model_ids.length,
        models_merged: merge.model_merges.length,
        applications_moved: merge.application_ids.length,
      },
      merge
    )
  },
  async (merge: MakeMerge | undefined, { container }) => {
    if (!merge) {
      return
    }

    const catalog = resolveCatalog(container)

    if (merge.alias_ids.length) {
      await catalog.deleteVehicleMakeAliasRecords(merge.alias_ids)
    }

    await catalog.restoreVehicleMakes(merge.source_make_id)

    if (merge.application_ids.length) {
      await catalog.updatePartApplications({
        selector: { id: merge.application_ids },
        data: { vehicle_make_id: merge.source_make_id },
      })
    }

    for (const modelMerge of merge.model_merges) {
      await undoModelMerge(catalog, modelMerge)
    }

    if (merge.moved_model_ids.length) {
      await catalog.updateVehicleModels({
        selector: { id: merge.moved_model_ids },
        data: { make_id: merge.source_make_id },
      })
    }
  }
)
