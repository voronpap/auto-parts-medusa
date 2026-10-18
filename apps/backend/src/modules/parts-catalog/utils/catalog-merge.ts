import { createHash } from "node:crypto";

type Row = Record<string, unknown>;

type MergeTable = {
  name: string;
  key: string[];
  references: Record<string, string>;
  externalReferences?: Record<string, { schema: string; table: string }>;
};

export type CatalogMergeAdapter = {
  columns(schema: string, table: string): Promise<string[]>;
  rows(
    schema: string,
    table: string,
    afterId: string | null,
    limit: number,
  ): Promise<Row[]>;
  find(schema: string, table: string, fields: Row): Promise<Row[]>;
  findById(schema: string, table: string, id: string): Promise<Row | null>;
  insert(schema: string, table: string, row: Row): Promise<void>;
};

export type CatalogMergeConflict = {
  table: string;
  source_id: string;
  reason: string;
};

export type CatalogMergeReport = {
  source_schema: string;
  target_schema: string;
  dry_run: boolean;
  tables: Record<
    string,
    { scanned: number; matched: number; inserted: number }
  >;
  conflicts: CatalogMergeConflict[];
};

const TABLES: MergeTable[] = [
  { name: "parts_brand", key: ["normalized_name"], references: {} },
  {
    name: "parts_brand_alias",
    key: ["normalized_alias"],
    references: { brand_id: "parts_brand" },
  },
  {
    name: "part_number",
    key: ["brand_id", "number_type", "normalized_number"],
    references: { brand_id: "parts_brand" },
  },
  {
    name: "part_number_search_key",
    key: ["part_number_id", "key"],
    references: { part_number_id: "part_number" },
  },
  { name: "parts_source", key: ["name"], references: {} },
  {
    name: "parts_observation",
    key: [
      "source_id",
      "record_ref",
      "url",
      "catalog_version",
      "parser_version",
      "retrieved_at",
    ],
    references: { source_id: "parts_source" },
  },
  { name: "vehicle_make", key: ["normalized_name"], references: {} },
  {
    name: "vehicle_make_alias",
    key: ["normalized_alias"],
    references: { make_id: "vehicle_make" },
  },
  {
    name: "vehicle_model",
    key: ["make_id", "normalized_name"],
    references: { make_id: "vehicle_make" },
  },
  {
    name: "vehicle_model_alias",
    key: ["model_id", "normalized_alias"],
    references: { model_id: "vehicle_model" },
  },
  {
    name: "part_relationship",
    key: [
      "from_part_number_id",
      "to_part_number_id",
      "relation_type",
      "constraints",
      "reason",
      "valid_from",
      "valid_to",
    ],
    references: {
      from_part_number_id: "part_number",
      to_part_number_id: "part_number",
    },
  },
  {
    name: "part_relationship_evidence",
    key: ["relationship_id", "observation_id"],
    references: {
      relationship_id: "part_relationship",
      observation_id: "parts_observation",
    },
  },
  {
    name: "part_application",
    key: [
      "part_number_id",
      "observation_id",
      "vehicle_make_id",
      "vehicle_model_id",
      "make",
      "model",
      "generation",
      "body",
      "market",
      "year_from",
      "year_to",
      "engine",
      "engine_code",
      "power_kw",
      "fuel",
      "drivetrain",
      "transmission",
      "position",
      "side",
      "quantity",
      "constraints",
      "raw_text",
    ],
    references: {
      part_number_id: "part_number",
      observation_id: "parts_observation",
      vehicle_make_id: "vehicle_make",
      vehicle_model_id: "vehicle_model",
    },
  },
  {
    name: "part_attribute",
    key: [
      "part_number_id",
      "observation_id",
      "name",
      "value",
      "unit",
      "raw_text",
    ],
    references: {
      part_number_id: "part_number",
      observation_id: "parts_observation",
    },
  },
  {
    name: "part_image",
    key: ["part_number_id", "observation_id", "source_url", "position"],
    references: {
      part_number_id: "part_number",
      observation_id: "parts_observation",
    },
  },
  {
    name: "product_product_variant_partscatalog_part_number",
    key: ["product_variant_id", "part_number_id"],
    references: { part_number_id: "part_number" },
    externalReferences: {
      product_variant_id: { schema: "public", table: "product_variant" },
    },
  },
];

export const CATALOG_MERGE_REQUIRED_COLUMNS = Object.fromEntries(
  TABLES.map((table) => [
    table.name,
    [
      "id",
      ...table.key,
      ...Object.keys(table.references),
      ...Object.keys(table.externalReferences ?? {}),
    ],
  ]),
);

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Row)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }

  return value instanceof Date ? value.toISOString() : value;
}

function signature(row: Row, fields: string[]): string {
  return JSON.stringify(
    stableValue(
      Object.fromEntries(fields.map((field) => [field, row[field] ?? null])),
    ),
  );
}

function businessRow(row: Row): Row {
  return Object.fromEntries(
    Object.entries(row)
      .filter(([field]) => !["id", "created_at", "updated_at"].includes(field))
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([field, value]) => [field, stableValue(value)]),
  );
}

function remappedId(table: string, sourceId: string): string {
  const digest = createHash("sha256")
    .update(`${table}\0${sourceId}`)
    .digest("hex")
    .slice(0, 32);

  return `mrg_${digest}`;
}

export async function mergeCatalogSchemas(
  adapter: CatalogMergeAdapter,
  sourceSchema: string,
  targetSchema: string,
  options: { dryRun: boolean; batchSize?: number },
): Promise<CatalogMergeReport> {
  const batchSize = options.batchSize ?? 500;
  const report: CatalogMergeReport = {
    source_schema: sourceSchema,
    target_schema: targetSchema,
    dry_run: options.dryRun,
    tables: {},
    conflicts: [],
  };
  const idMaps = new Map<string, Map<string, string>>();
  const sourceIds = new Map<string, Set<string>>();

  for (const table of TABLES) {
    const [sourceColumns, targetColumns] = await Promise.all([
      adapter.columns(sourceSchema, table.name),
      adapter.columns(targetSchema, table.name),
    ]);
    const expectedColumns = [...sourceColumns].sort();
    const actualColumns = [...targetColumns].sort();

    const requiredColumns = CATALOG_MERGE_REQUIRED_COLUMNS[table.name];
    if (
      !requiredColumns ||
      requiredColumns.some(
        (column) =>
          !sourceColumns.includes(column) || !targetColumns.includes(column),
      )
    ) {
      report.conflicts.push({
        table: table.name,
        source_id: "",
        reason:
          "Required table or columns are missing from source or target schema",
      });
      continue;
    }

    if (JSON.stringify(expectedColumns) !== JSON.stringify(actualColumns)) {
      report.conflicts.push({
        table: table.name,
        source_id: "",
        reason:
          "Source and target table columns differ; apply matching schema migrations first",
      });
      continue;
    }

    const tableReport = (report.tables[table.name] = {
      scanned: 0,
      matched: 0,
      inserted: 0,
    });
    const idMap = new Map<string, string>();
    idMaps.set(table.name, idMap);
    const sourceIdSet = new Set<string>();
    sourceIds.set(table.name, sourceIdSet);
    const plannedByKey = new Map<string, Row>();
    const plannedById = new Map<string, Row>();
    let afterId: string | null = null;

    while (true) {
      const batch = await adapter.rows(
        sourceSchema,
        table.name,
        afterId,
        batchSize,
      );
      if (!batch.length) {
        break;
      }

      for (const sourceRow of batch) {
        const sourceId = String(sourceRow.id);
        sourceIdSet.add(sourceId);
        tableReport.scanned += 1;
        const row: Row = { ...sourceRow };
        let hasUnmappedReference = false;

        for (const [field, parentTable] of Object.entries(table.references)) {
          const reference = row[field];
          if (reference === null || reference === undefined) {
            continue;
          }

          const mapped = idMaps.get(parentTable)?.get(String(reference));
          if (mapped) {
            row[field] = mapped;
            continue;
          }

          if (sourceIds.get(parentTable)?.has(String(reference))) {
            report.conflicts.push({
              table: table.name,
              source_id: sourceId,
              reason: `Referenced source ${parentTable} row ${String(reference)} was not mergeable`,
            });
            hasUnmappedReference = true;
            continue;
          }

          const existingParent = await adapter.findById(
            targetSchema,
            parentTable,
            String(reference),
          );
          if (existingParent) {
            row[field] = String(existingParent.id);
            continue;
          }

          report.conflicts.push({
            table: table.name,
            source_id: sourceId,
            reason: `Unmapped foreign key ${field}=${String(reference)}`,
          });
          hasUnmappedReference = true;
        }

        for (const [field, parent] of Object.entries(
          table.externalReferences ?? {},
        )) {
          const reference = row[field];
          if (reference === null || reference === undefined) {
            continue;
          }

          const existing = await adapter.findById(
            parent.schema,
            parent.table,
            String(reference),
          );
          if (!existing) {
            report.conflicts.push({
              table: table.name,
              source_id: sourceId,
              reason: `Destination ${parent.table} row not found for ${field}=${String(reference)}`,
            });
            hasUnmappedReference = true;
          }
        }

        if (hasUnmappedReference) {
          afterId = sourceId;
          continue;
        }

        const key = signature(row, table.key);
        const plannedMatch = plannedByKey.get(key);
        const candidates = plannedMatch
          ? [plannedMatch]
          : await adapter.find(
              targetSchema,
              table.name,
              Object.fromEntries(
                table.key.map((field) => [field, row[field] ?? null]),
              ),
            );

        if (candidates.length > 1) {
          report.conflicts.push({
            table: table.name,
            source_id: sourceId,
            reason: "Multiple target rows have the same natural key",
          });
          afterId = sourceId;
          continue;
        }

        const existing = candidates[0];
        if (existing) {
          row.id = existing.id;
          if (
            JSON.stringify(businessRow(row)) !==
            JSON.stringify(businessRow(existing))
          ) {
            report.conflicts.push({
              table: table.name,
              source_id: sourceId,
              reason: "Natural-key match has differing business fields",
            });
          } else {
            tableReport.matched += 1;
            idMap.set(sourceId, String(existing.id));
            plannedByKey.set(key, existing);
          }
          afterId = sourceId;
          continue;
        }

        const collidingPlanned = plannedById.get(sourceId);
        const idCollision = collidingPlanned
          ? collidingPlanned
          : await adapter.findById(targetSchema, table.name, sourceId);
        row.id = idCollision ? remappedId(table.name, sourceId) : sourceId;

        const remappedCollision =
          row.id === sourceId
            ? null
            : await adapter.findById(targetSchema, table.name, String(row.id));
        if (remappedCollision) {
          report.conflicts.push({
            table: table.name,
            source_id: sourceId,
            reason: `Deterministic remapped ID ${String(row.id)} already exists`,
          });
          afterId = sourceId;
          continue;
        }

        if (!options.dryRun) {
          await adapter.insert(targetSchema, table.name, row);
        }
        tableReport.inserted += 1;
        idMap.set(sourceId, String(row.id));
        plannedByKey.set(key, row);
        plannedById.set(String(row.id), row);
      }

      afterId = String(batch[batch.length - 1].id);
      if (batch.length < batchSize) {
        break;
      }
    }
  }

  if (report.conflicts.length) {
    throw new CatalogMergeError(report);
  }

  return report;
}

export class CatalogMergeError extends Error {
  constructor(readonly report: CatalogMergeReport) {
    super(`Catalog merge stopped with ${report.conflicts.length} conflict(s)`);
  }
}
