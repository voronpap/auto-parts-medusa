/**
 * Checks brand editing, relationship editing and brand merging end to end on
 * throwaway records, then removes them.
 *
 *   pnpm exec medusa exec ./src/scripts/smoke-catalog-editing.ts
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { PARTS_CATALOG_MODULE } from "../modules/parts-catalog"
import PartsCatalogModuleService from "../modules/parts-catalog/service"
import {
  createPartNumberWorkflow,
  createPartRelationshipWorkflow,
  createPartsBrandWorkflow,
  deletePartNumberWorkflow,
  deletePartsBrandWorkflow,
  mergePartsBrandsWorkflow,
  updatePartRelationshipWorkflow,
  updatePartsBrandWorkflow,
} from "../workflows/parts-catalog"

const check = (condition: unknown, message: string) => {
  if (!condition) {
    throw new Error(`FAILED: ${message}`)
  }
}

export default async function smokeCatalogEditing({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const catalog =
    container.resolve<PartsCatalogModuleService>(PARTS_CATALOG_MODULE)
  const tag = `ZZSMOKE${Date.now().toString(36).toUpperCase()}`
  const brand = async (name: string, aliases?: string[]) =>
    (await createPartsBrandWorkflow(container).run({ input: { name, aliases } }))
      .result
  const number = async (brandId: string, value: string) =>
    (
      await createPartNumberWorkflow(container).run({
        input: { brand_id: brandId, number_type: "aftermarket", number: value },
      })
    ).result
  const relate = async (from: string, to: string) =>
    (
      await createPartRelationshipWorkflow(container).run({
        input: {
          from_part_number_id: from,
          to_part_number_id: to,
          relation_type: "AFTERMARKET_CROSS",
        },
      })
    ).result

  const keep = await brand(`${tag} Keep`)
  const dup = await brand(`${tag} Dup`, [`${tag} Old`])

  try {
    const keepTwin = await number(keep.id, "ZZ 100")
    const keepOnly = await number(keep.id, "ZZ 200")
    const other = await number(keep.id, "ZZ 900")
    const dupTwin = await number(dup.id, "ZZ-100")
    const dupOnly = await number(dup.id, "ZZ 300")
    const existing = await relate(keepTwin.id, other.id)
    await relate(dupTwin.id, other.id)
    const moved = await relate(dupOnly.id, other.id)
    const incoming = await relate(keepOnly.id, dupTwin.id)

    // Relationship editing
    const { result: rejected } = await updatePartRelationshipWorkflow(
      container
    ).run({
      input: { id: moved.id, applicability_verdict: "REJECTED", reason: "smoke" },
    })
    check(rejected.applicability_verdict === "REJECTED", "verdict is updated")
    const refused = await updatePartRelationshipWorkflow(container)
      .run({ input: { id: moved.id, applicability_verdict: "ACCEPTED" } })
      .then(() => false)
      .catch(() => true)
    check(refused, "accepting without authoritative evidence is refused")

    // Brand editing
    const clash = await updatePartsBrandWorkflow(container)
      .run({ input: { id: keep.id, aliases: [`${tag} Dup`] } })
      .then(() => false)
      .catch(() => true)
    check(clash, "an alias that is another brand's name is refused")
    await updatePartsBrandWorkflow(container).run({
      input: { id: keep.id, name: `${tag} Kept`, aliases: [`${tag} K`] },
    })
    const renamed = await catalog.retrieveBrand(keep.id, { relations: ["aliases"] })
    check(renamed.name === `${tag} Kept`, "brand is renamed")
    check(renamed.aliases.length === 1, "brand has the alias it was given")

    // Merging
    const { result } = await mergePartsBrandsWorkflow(container).run({
      input: { source_id: dup.id, target_id: keep.id },
    })
    check(result.numbers_merged === 1, "one number is merged with its twin")
    check(result.numbers_moved === 1, "one number changes brand")
    const numbers = await catalog.listPartNumbers({ brand_id: keep.id })
    check(numbers.length === 4, `target has 4 numbers, got ${numbers.length}`)
    check(
      (await catalog.listPartNumbers({ brand_id: dup.id })).length === 0,
      "source has no numbers left"
    )
    const fromTwin = await catalog.listPartRelationships({
      from_part_number_id: keepTwin.id,
    })
    check(
      fromTwin.length === 1 && fromTwin[0].id === existing.id,
      "the duplicate cross is folded into the existing one"
    )
    const toTwin = await catalog.listPartRelationships({
      to_part_number_id: keepTwin.id,
    })
    check(
      toTwin.length === 1 && toTwin[0].id === incoming.id,
      "a cross pointing at the merged number now points at its twin"
    )
    const merged = await catalog.retrieveBrand(keep.id, { relations: ["aliases"] })
    check(
      merged.aliases.some((alias) => alias.alias === `${tag} Dup`) &&
        merged.aliases.some((alias) => alias.alias === `${tag} Old`),
      "the source's name and aliases become aliases of the target"
    )
    check(
      (await catalog.listBrands({ id: dup.id })).length === 0,
      "the source brand is gone"
    )
    logger.info("Catalog editing smoke test passed")
  } finally {
    for (const brandId of [keep.id, dup.id]) {
      const numbers = await catalog.listPartNumbers(
        { brand_id: brandId },
        { withDeleted: true } as never
      )

      for (const item of numbers) {
        const relationships = [
          ...(await catalog.listPartRelationships({ from_part_number_id: item.id })),
          ...(await catalog.listPartRelationships({ to_part_number_id: item.id })),
        ]

        if (relationships.length) {
          await catalog.deletePartRelationships(relationships.map((r) => r.id))
        }
      }

      for (const item of numbers) {
        await deletePartNumberWorkflow(container)
          .run({ input: { id: item.id } })
          .catch(() => catalog.deletePartNumbers(item.id))
      }

      await deletePartsBrandWorkflow(container)
        .run({ input: { id: brandId } })
        .catch(() => catalog.deleteBrands(brandId).catch(() => undefined))
    }

    logger.info("Smoke records removed")
  }
}
