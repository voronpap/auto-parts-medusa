import { MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { PARTS_CATALOG_MODULE } from "../../../modules/parts-catalog"
import {
  ApplicabilityVerdict,
  LicenseClass,
  LookupTaskStatus,
  NumberType,
  RelationType,
  SourceKind,
} from "../../../modules/parts-catalog/constants"
import PartsCatalogModuleService from "../../../modules/parts-catalog/service"
import {
  formatDisplayNumber,
  normalizeBrandName,
  normalizePartNumber,
} from "../../../modules/parts-catalog/utils/normalize"
import {
  autoApplicationVerdict,
  autoVerdict,
  defaultRelationshipState,
  EvidenceSummary,
  isAutoManagedVerdict,
} from "../../../modules/parts-catalog/utils/verdict"

type NumberRef = {
  brand: string
  number_type: NumberType
  number: string
}

export type LookupResult = {
  worker?: string | null
  sources: {
    key: string
    name: string
    kind: Exclude<SourceKind, "ai" | "user">
    license_class: LicenseClass
    lineage?: string | null
    url?: string | null
    license_note?: string | null
    parser?: { name?: string | null; version?: string | null } | null
    catalog_version?: string | null
    retrieved_at?: string | null
  }[]
  relationships: {
    source: string
    to?: NumberRef | null
    direction?: "outgoing" | "incoming" | null
    relation_type: RelationType
    raw_relation_text?: string | null
    ambiguous?: boolean | null
    constraints?: Record<string, unknown> | null
    reason?: string | null
    record_ref?: string | null
    record_url?: string | null
  }[]
  applications: {
    source: string
    make: string
    model?: string | null
    generation?: string | null
    body?: string | null
    market?: string | null
    year_from?: number | null
    year_to?: number | null
    engine?: string | null
    engine_code?: string | null
    power_kw?: number | null
    fuel?: string | null
    drivetrain?: string | null
    transmission?: string | null
    position?: string | null
    side?: string | null
    quantity?: number | null
    constraints?: Record<string, unknown> | null
    raw_text?: string | null
    record_ref?: string | null
    record_url?: string | null
  }[]
  attributes: {
    source: string
    name: string
    value: string
    unit?: string | null
    raw_text?: string | null
  }[]
  errors: { source?: string | null; message: string }[]
}

export type IngestLookupResultInput = {
  task_id: string
  result: LookupResult
}

type Created = {
  task: {
    id: string
    status: LookupTaskStatus
    worker: string | null
    completed_at: Date | null
  }
  sources: string[]
  brands: string[]
  numbers: string[]
  observations: string[]
  relationships: string[]
  evidence: string[]
  applications: string[]
  attributes: string[]
  vehicle_makes: string[]
  vehicle_models: string[]
  verdicts: { id: string; applicability_verdict: ApplicabilityVerdict }[]
}

const hasKeys = (value?: Record<string, unknown> | null) =>
  Boolean(value && Object.keys(value).length)

const clean = (value?: string | null) => value?.trim() || null

async function rollback(catalog: PartsCatalogModuleService, created: Created) {
  if (created.evidence.length) {
    await catalog.deleteRelationshipEvidences(created.evidence)
  }
  if (created.relationships.length) {
    await catalog.deletePartRelationships(created.relationships)
  }
  if (created.applications.length) {
    await catalog.deletePartApplications(created.applications)
  }
  if (created.attributes.length) {
    await catalog.deletePartAttributes(created.attributes)
  }
  if (created.observations.length) {
    await catalog.deleteObservations(created.observations)
  }
  if (created.vehicle_models.length) {
    await catalog.deleteVehicleModels(created.vehicle_models)
  }
  if (created.vehicle_makes.length) {
    await catalog.deleteVehicleMakes(created.vehicle_makes)
  }
  if (created.numbers.length) {
    await catalog.deletePartNumbers(created.numbers)
  }
  if (created.brands.length) {
    await catalog.deleteBrands(created.brands)
  }
  if (created.sources.length) {
    await catalog.deleteSources(created.sources)
  }
  if (created.verdicts.length) {
    await catalog.updatePartRelationships(created.verdicts)
  }
  await catalog.updateLookupTasks(created.task)
}

export const ingestLookupResultStep = createStep(
  "ingest-lookup-result",
  async ({ task_id, result }: IngestLookupResultInput, { container }) => {
    const catalog = container.resolve<PartsCatalogModuleService>(
      PARTS_CATALOG_MODULE
    )
    const task = await catalog.retrieveLookupTask(task_id, {
      relations: ["part_number"],
    })

    if (task.status === "done" || task.status === "failed") {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "This lookup task already has a result"
      )
    }

    const subject = task.part_number
    const created: Created = {
      task: {
        id: task.id,
        status: task.status,
        worker: task.worker,
        completed_at: task.completed_at,
      },
      sources: [],
      brands: [],
      numbers: [],
      observations: [],
      relationships: [],
      evidence: [],
      applications: [],
      attributes: [],
      vehicle_makes: [],
      vehicle_models: [],
      verdicts: [],
    }
    const summary = {
      relationships_added: 0,
      relationships_confirmed: 0,
      relationships_unchanged: 0,
      applications_added: 0,
      attributes_added: 0,
      skipped: 0,
      errors: result.errors.length,
    }

    try {
      // Sources named by the worker are matched by name and created once.
      // An existing source keeps its license class and lineage.
      const sources = new Map<
        string,
        {
          id: string
          kind: SourceKind
          lineage: string
          meta: LookupResult["sources"][number]
        }
      >()

      for (const meta of result.sources) {
        const name = meta.name.trim()
        let [source] = await catalog.listSources({ name })

        if (!source) {
          source = await catalog.createSources({
            name,
            kind: meta.kind,
            license_class: meta.license_class,
            lineage: normalizeBrandName(clean(meta.lineage) ?? name),
            url: clean(meta.url),
            license_note: clean(meta.license_note),
          })
          created.sources.push(source.id)
        }

        sources.set(meta.key, {
          id: source.id,
          kind: source.kind,
          lineage: source.lineage,
          meta,
        })
      }

      // Facts read from the same record of a source (one catalogue page,
      // one article card) share an observation.
      const observations = new Map<string, { id: string }>()
      const observe = async (
        source: { id: string; meta: LookupResult["sources"][number] },
        item: { record_ref?: string | null; record_url?: string | null }
      ) => {
        const key = `${source.id}|${clean(item.record_ref) ?? ""}|${clean(item.record_url) ?? ""}`
        const known = observations.get(key)

        if (known) {
          return known
        }

        const observation = await catalog.createObservations({
          source_id: source.id,
          record_ref: clean(item.record_ref),
          url: clean(item.record_url),
          catalog_version: clean(source.meta.catalog_version),
          parser_version: clean(
            [source.meta.parser?.name, source.meta.parser?.version]
              .filter(Boolean)
              .join("@")
          ),
          retrieved_at: source.meta.retrieved_at
            ? new Date(source.meta.retrieved_at)
            : new Date(),
          status: "active",
        })
        created.observations.push(observation.id)
        observations.set(key, observation)

        return observation
      }

      const brandIds = new Map<string, string | null>()
      const resolveBrandId = async (name: string, numberType: NumberType) => {
        const key = normalizeBrandName(name)

        if (!key) {
          return null
        }

        if (brandIds.has(key)) {
          return brandIds.get(key)!
        }

        let brandId = (await catalog.listBrands({ normalized_name: key }))[0]?.id

        if (!brandId) {
          brandId = (
            await catalog.listBrandAliasRecords({ normalized_alias: key })
          )[0]?.brand_id
        }

        if (!brandId) {
          const brand = await catalog.createBrands({
            name: name.trim(),
            normalized_name: key,
            kind:
              numberType === "oem" ? "vehicle_manufacturer" : "parts_manufacturer",
          })
          created.brands.push(brand.id)
          brandId = brand.id
        }

        brandIds.set(key, brandId)

        return brandId
      }

      const resolveNumberId = async (ref: NumberRef) => {
        const normalized = normalizePartNumber(ref.number)
        const brandId = normalized
          ? await resolveBrandId(ref.brand, ref.number_type)
          : null

        if (!brandId) {
          return null
        }

        const [existing] = await catalog.listPartNumbers({
          brand_id: brandId,
          number_type: ref.number_type,
          normalized_number: normalized,
        })

        if (existing) {
          return existing.id
        }

        const partNumber = await catalog.createPartNumbers({
          brand_id: brandId,
          number_type: ref.number_type,
          source_number: ref.number,
          display_number: formatDisplayNumber(ref.number),
          normalized_number: normalized,
        })
        created.numbers.push(partNumber.id)
        await catalog.createPartNumberSearchKeys({
          key: normalized,
          part_number_id: partNumber.id,
        })

        return partNumber.id
      }

      for (const item of result.relationships) {
        const source = sources.get(item.source)
        const isTerminal = item.relation_type === "DISCONTINUED_NO_REPLACEMENT"
        const otherId =
          !isTerminal && item.to ? await resolveNumberId(item.to) : null

        if (!source || (!isTerminal && (!otherId || otherId === subject.id))) {
          summary.skipped += 1
          continue
        }

        const incoming = item.direction === "incoming" && !isTerminal
        const fromId = incoming ? otherId! : subject.id
        const toId = isTerminal ? null : incoming ? subject.id : otherId
        const [existing] = await catalog.listPartRelationships(
          {
            from_part_number_id: fromId,
            to_part_number_id: toId,
            relation_type: item.relation_type,
          },
          {
            relations: [
              "evidence",
              "evidence.observation",
              "evidence.observation.source",
            ],
          }
        )
        const priorEvidence = existing?.evidence ?? []

        // The same source repeating itself adds nothing.
        if (
          priorEvidence.some(
            (evidence) =>
              evidence.observation?.source?.id === source.id &&
              evidence.observation.status === "active"
          )
        ) {
          summary.relationships_unchanged += 1
          continue
        }

        const evidence: EvidenceSummary[] = [
          ...priorEvidence.flatMap((entry) =>
            entry.observation?.source
              ? [
                  {
                    source_kind: entry.observation.source.kind,
                    lineage: entry.observation.source.lineage,
                    status: entry.observation.status,
                  },
                ]
              : []
          ),
          { source_kind: source.kind, lineage: source.lineage, status: "active" },
        ]
        const verdict = autoVerdict({
          relation_type: item.relation_type,
          ambiguous: Boolean(item.ambiguous),
          has_constraints:
            hasKeys(item.constraints) ||
            hasKeys(existing?.constraints as Record<string, unknown> | null),
          evidence,
        })
        const observation = await observe(source, item)
        let relationshipId = existing?.id

        if (existing) {
          if (
            isAutoManagedVerdict(existing.applicability_verdict) &&
            existing.applicability_verdict !== verdict
          ) {
            created.verdicts.push({
              id: existing.id,
              applicability_verdict: existing.applicability_verdict,
            })
            await catalog.updatePartRelationships({
              id: existing.id,
              applicability_verdict: verdict,
            })
          }

          summary.relationships_confirmed += 1
        } else {
          const relationship = await catalog.createPartRelationships({
            from_part_number_id: fromId,
            to_part_number_id: toId,
            relation_type: item.relation_type,
            relationship_state: defaultRelationshipState(item.relation_type),
            applicability_verdict: verdict,
            constraints: hasKeys(item.constraints) ? item.constraints : null,
            reason:
              clean(item.reason) ??
              (item.relation_type === "NOT_APPLICABLE_TO"
                ? (clean(item.raw_relation_text) ?? "Source gave no reason")
                : null),
          })
          created.relationships.push(relationship.id)
          relationshipId = relationship.id
          summary.relationships_added += 1
        }

        const link = await catalog.createRelationshipEvidences({
          relationship_id: relationshipId!,
          observation_id: observation.id,
          raw_relation_text: clean(item.raw_relation_text),
          source_semantics: item.ambiguous ? "ambiguous" : null,
        })
        created.evidence.push(link.id)
      }

      // Match the source's make and model wording to the vehicle directory.
      // Unknown names are added and flagged for review, so nothing is lost
      // and duplicates can be merged later.
      const makeIds = new Map<string, string>()
      const resolveMakeId = async (name: string) => {
        const key = normalizeBrandName(name)

        if (!key) {
          return null
        }

        let makeId = makeIds.get(key)

        if (!makeId) {
          makeId =
            (await catalog.listVehicleMakes({ normalized_name: key }))[0]?.id ??
            (
              await catalog.listVehicleMakeAliasRecords({
                normalized_alias: key,
              })
            )[0]?.make_id

          if (!makeId) {
            const make = await catalog.createVehicleMakes({
              name: name.trim(),
              normalized_name: key,
              needs_review: true,
            })
            created.vehicle_makes.push(make.id)
            makeId = make.id
          }

          makeIds.set(key, makeId)
        }

        return makeId
      }

      const modelIds = new Map<string, string>()
      const resolveModelId = async (makeId: string, name?: string | null) => {
        const key = name ? normalizeBrandName(name) : ""

        if (!key) {
          return null
        }

        const cacheKey = `${makeId}|${key}`
        let modelId = modelIds.get(cacheKey)

        if (!modelId) {
          modelId = (
            await catalog.listVehicleModels({
              make_id: makeId,
              normalized_name: key,
            })
          )[0]?.id

          if (!modelId) {
            const aliases = await catalog.listVehicleModelAliasRecords(
              { normalized_alias: key },
              { relations: ["model"] }
            )
            modelId = aliases.find((alias) => alias.model?.make_id === makeId)
              ?.model_id
          }

          if (!modelId) {
            const model = await catalog.createVehicleModels({
              make_id: makeId,
              name: name!.trim(),
              normalized_name: key,
              needs_review: true,
            })
            created.vehicle_models.push(model.id)
            modelId = model.id
          }

          modelIds.set(cacheKey, modelId)
        }

        return modelId
      }

      const knownApplications = new Set(
        (
          await catalog.listPartApplications(
            { part_number_id: subject.id },
            { relations: ["observation"] }
          )
        ).map(
          (application) =>
            `${application.observation?.source_id}|${application.raw_text ?? ""}|${application.make}|${application.model ?? ""}|${application.engine ?? ""}|${application.year_from ?? ""}`
        )
      )

      const newApplications: Parameters<
        typeof catalog.createPartApplications
      >[0] = []

      for (const item of result.applications) {
        const source = sources.get(item.source)
        const make = item.make.trim()
        const key = `${source?.id}|${clean(item.raw_text) ?? ""}|${make}|${clean(item.model) ?? ""}|${clean(item.engine) ?? ""}|${item.year_from ?? ""}`

        if (!source || !make || knownApplications.has(key)) {
          summary.skipped += 1
          continue
        }

        knownApplications.add(key)

        const vehicleMakeId = await resolveMakeId(make)
        const vehicleModelId = vehicleMakeId
          ? await resolveModelId(vehicleMakeId, item.model)
          : null
        const observation = await observe(source, item)
        newApplications.push({
          part_number_id: subject.id,
          observation_id: observation.id,
          vehicle_make_id: vehicleMakeId,
          vehicle_model_id: vehicleModelId,
          applicability_verdict: autoApplicationVerdict(
            source.kind,
            hasKeys(item.constraints)
          ),
          make,
          model: clean(item.model),
          generation: clean(item.generation),
          body: clean(item.body),
          market: clean(item.market),
          year_from: item.year_from ?? null,
          year_to: item.year_to ?? null,
          engine: clean(item.engine),
          engine_code: clean(item.engine_code),
          power_kw: item.power_kw ?? null,
          fuel: clean(item.fuel),
          drivetrain: clean(item.drivetrain),
          transmission: clean(item.transmission),
          position: clean(item.position),
          side: clean(item.side),
          quantity: item.quantity ?? null,
          constraints: hasKeys(item.constraints) ? item.constraints : null,
          raw_text: clean(item.raw_text),
        })
        summary.applications_added += 1
      }

      if (newApplications.length) {
        const applications =
          await catalog.createPartApplications(newApplications)
        created.applications.push(
          ...applications.map((application) => application.id)
        )
      }

      const knownAttributes = new Set(
        (
          await catalog.listPartAttributes(
            { part_number_id: subject.id },
            { relations: ["observation"] }
          )
        ).map(
          (attribute) =>
            `${attribute.observation?.source_id}|${attribute.name}|${attribute.value}`
        )
      )

      for (const item of result.attributes) {
        const source = sources.get(item.source)
        const name = item.name.trim()
        const value = item.value.trim()
        const key = `${source?.id}|${name}|${value}`

        if (!source || !name || !value || knownAttributes.has(key)) {
          summary.skipped += 1
          continue
        }

        knownAttributes.add(key)

        const observation = await observe(source, {})
        const attribute = await catalog.createPartAttributes({
          part_number_id: subject.id,
          observation_id: observation.id,
          name,
          value,
          unit: clean(item.unit),
          raw_text: clean(item.raw_text),
        })
        created.attributes.push(attribute.id)
        summary.attributes_added += 1
      }

      const foundNothing =
        !result.relationships.length &&
        !result.applications.length &&
        !result.attributes.length

      await catalog.updateLookupTasks({
        id: task.id,
        // Sources failing with nothing found is a failed lookup, not "no data".
        status: foundNothing && result.errors.length ? "failed" : "done",
        worker: clean(result.worker) ?? task.worker,
        completed_at: new Date(),
        summary,
        errors: result.errors.length ? { items: result.errors } : null,
      })
    } catch (error) {
      // A step that throws is not compensated, so undo partial writes here.
      await rollback(catalog, created)
      throw error
    }

    return new StepResponse({ task_id: task.id, summary }, created)
  },
  async (created: Created | undefined, { container }) => {
    if (!created) {
      return
    }

    const catalog = container.resolve<PartsCatalogModuleService>(
      PARTS_CATALOG_MODULE
    )
    await rollback(catalog, created)
  }
)
