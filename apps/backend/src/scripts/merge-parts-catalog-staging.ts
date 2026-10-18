import type { ExecArgs } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";
import {
  CatalogMergeAdapter,
  CatalogMergeError,
  mergeCatalogSchemas,
} from "../modules/parts-catalog/utils/catalog-merge";

type QueryResult<T> = { rows: T[] };
type QueryBuilder = {
  select: (...columns: string[]) => QueryBuilder;
  where: (
    field: string | Record<string, unknown>,
    operatorOrValue?: unknown,
    value?: unknown,
  ) => QueryBuilder;
  orderBy: (field: string, direction?: "asc" | "desc") => QueryBuilder;
  limit: (count: number) => QueryBuilder;
  insert: (row: Record<string, unknown>) => Promise<unknown>;
  then: (
    resolve: (rows: Record<string, unknown>[]) => unknown,
    reject?: (error: unknown) => unknown,
  ) => Promise<unknown>;
};
type Database = {
  raw: (
    query: string,
    bindings?: unknown[],
  ) => Promise<
    QueryResult<
      {
        column_name?: string;
        database_name?: string;
      } & Record<string, unknown>
    >
  >;
  withSchema: (schema: string) => { table: (table: string) => QueryBuilder };
  transaction: <T>(
    callback: (transaction: Database) => Promise<T>,
  ) => Promise<T>;
};

const SOURCE_SCHEMA = "catalog_source";
const TARGET_SCHEMA = "catalog_target";

export function createCatalogMergeAdapter(db: Database): CatalogMergeAdapter {
  return {
    async columns(schema, table) {
      const { rows } = await db.raw(
        `select column_name from information_schema.columns
         where table_schema = ? and table_name = ?
         order by ordinal_position`,
        [schema, table],
      );

      return rows.map((row) => row.column_name ?? "");
    },
    async rows(schema, table, afterId, limit) {
      let query = db.withSchema(schema).table(table).select("*");
      if (afterId !== null) {
        query = query.where("id", ">", afterId);
      }
      return (await query
        .orderBy("id", "asc")
        .limit(limit)) as unknown as Record<string, unknown>[];
    },
    async find(schema, table, fields) {
      return (await db
        .withSchema(schema)
        .table(table)
        .select("*")
        .where(fields)
        .limit(2)) as unknown as Record<string, unknown>[];
    },
    async findById(schema, table, id) {
      const rows = (await db
        .withSchema(schema)
        .table(table)
        .select("*")
        .where("id", id)
        .limit(1)) as unknown as Record<string, unknown>[];
      return rows[0] ?? null;
    },
    async insert(schema, table, row) {
      await db.withSchema(schema).table(table).insert(row);
    },
  };
}

function validateIdentifier(value: string, label: string): void {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(value)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `${label} must be a lowercase PostgreSQL schema identifier`,
    );
  }
}

export default async function mergePartsCatalogStaging({
  container,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const db = container.resolve<Database>(
    ContainerRegistrationKeys.PG_CONNECTION,
  );
  const sourceSchema = process.env.CATALOG_MERGE_SOURCE_SCHEMA ?? SOURCE_SCHEMA;
  const targetSchema = process.env.CATALOG_MERGE_TARGET_SCHEMA ?? TARGET_SCHEMA;
  validateIdentifier(sourceSchema, "CATALOG_MERGE_SOURCE_SCHEMA");
  validateIdentifier(targetSchema, "CATALOG_MERGE_TARGET_SCHEMA");

  if (
    sourceSchema === targetSchema ||
    sourceSchema === "public" ||
    targetSchema === "public"
  ) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Staging merge requires distinct non-public source and target schemas",
    );
  }

  const { rows: databaseRows } = await db.raw(
    "select current_database() as database_name",
  );
  const databaseName = databaseRows[0]?.database_name;
  if (
    typeof databaseName !== "string" ||
    /(^|[_-])(prod|production|live)([_-]|$)/i.test(databaseName)
  ) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      `Refusing staging merge on database "${databaseName ?? "unknown"}"`,
    );
  }

  const dryRun = process.env.CATALOG_MERGE_APPLY !== "yes";
  const stagingDatabase =
    typeof databaseName === "string" &&
    /(^|[_-])(stage|staging|test|rehearsal)([_-]|$)/i.test(databaseName);
  if (
    !dryRun &&
    (!stagingDatabase ||
      process.env.CATALOG_MERGE_ENV !== "staging" ||
      process.env.CATALOG_MERGE_CONFIRM !== "staging")
  ) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Applying requires a staging-named database plus CATALOG_MERGE_ENV=staging and CATALOG_MERGE_CONFIRM=staging",
    );
  }

  const batchSize = Number.parseInt(
    process.env.CATALOG_MERGE_BATCH_SIZE ?? "500",
    10,
  );
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 5000) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "CATALOG_MERGE_BATCH_SIZE must be between 1 and 5000",
    );
  }

  const run = (connection: Database) =>
    mergeCatalogSchemas(
      createCatalogMergeAdapter(connection),
      sourceSchema,
      targetSchema,
      {
        dryRun,
        batchSize,
      },
    );

  try {
    const report = dryRun
      ? await run(db)
      : await db.transaction((transaction) => run(transaction));
    logger.info(JSON.stringify(report));
  } catch (error) {
    if (error instanceof CatalogMergeError) {
      logger.error(JSON.stringify(error.report));
    }
    throw error;
  }
}
