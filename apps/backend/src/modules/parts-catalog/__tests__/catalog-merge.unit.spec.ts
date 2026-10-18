import {
  CATALOG_MERGE_REQUIRED_COLUMNS,
  CatalogMergeAdapter,
  CatalogMergeError,
  mergeCatalogSchemas,
} from "../utils/catalog-merge";

class MemoryCatalog implements CatalogMergeAdapter {
  readonly data = new Map<string, Record<string, unknown>[]>();
  readonly schemas = new Map<string, string[]>();

  set(schema: string, table: string, rows: Record<string, unknown>[]) {
    this.data.set(`${schema}.${table}`, rows);
    const columns = new Set<string>([
      "id",
      "created_at",
      "updated_at",
      "deleted_at",
    ]);
    rows.forEach((row) => Object.keys(row).forEach((key) => columns.add(key)));
    const counterpart = this.schemas.get(
      `${schema === "source" ? "target" : "source"}.${table}`,
    );
    counterpart?.forEach((column) => columns.add(column));
    this.schemas.set(`${schema}.${table}`, [...columns]);
  }

  async columns(schema: string, table: string) {
    return (
      this.schemas.get(`${schema}.${table}`) ??
      this.schemas.get(
        `${schema === "source" ? "target" : "source"}.${table}`,
      ) ??
      []
    );
  }

  async rows(
    schema: string,
    table: string,
    afterId: string | null,
    limit: number,
  ) {
    return (this.data.get(`${schema}.${table}`) ?? [])
      .filter((row) => afterId === null || String(row.id) > afterId)
      .sort((left, right) =>
        String(left.id) < String(right.id)
          ? -1
          : String(left.id) > String(right.id)
            ? 1
            : 0,
      )
      .slice(0, limit);
  }

  async find(schema: string, table: string, fields: Record<string, unknown>) {
    return (this.data.get(`${schema}.${table}`) ?? []).filter((row) =>
      Object.entries(fields).every(
        ([field, value]) =>
          JSON.stringify(row[field] ?? null) === JSON.stringify(value ?? null),
      ),
    );
  }

  async findById(schema: string, table: string, id: string) {
    return (
      this.data.get(`${schema}.${table}`)?.find((row) => row.id === id) ?? null
    );
  }

  async insert(schema: string, table: string, row: Record<string, unknown>) {
    const key = `${schema}.${table}`;
    this.data.set(key, [...(this.data.get(key) ?? []), row]);
  }
}

const createdAt = new Date("2026-10-16T00:00:00.000Z");
const timestamps = {
  created_at: createdAt,
  updated_at: createdAt,
  deleted_at: null,
};

function initializeEmptyTables(db: MemoryCatalog, schema: string) {
  for (const [table, columns] of Object.entries(
    CATALOG_MERGE_REQUIRED_COLUMNS,
  )) {
    if (table === "part_number" && schema === "target") {
      continue;
    }
    db.schemas.set(`${schema}.${table}`, [
      ...new Set([...columns, "created_at", "updated_at", "deleted_at"]),
    ]);
    db.data.set(`${schema}.${table}`, []);
  }
}

const options = { dryRun: false, batchSize: 1 };

describe("mergeCatalogSchemas", () => {
  it("maps natural-key matches before inserting dependent rows and reruns cleanly", async () => {
    const db = new MemoryCatalog();
    initializeEmptyTables(db, "source");
    initializeEmptyTables(db, "target");
    db.set("source", "parts_brand", [
      {
        id: "source_brand",
        name: "Bosch",
        normalized_name: "bosch",
        kind: "parts_manufacturer",
        ...timestamps,
      },
    ]);
    db.set("target", "parts_brand", [
      {
        id: "target_brand",
        name: "Bosch",
        normalized_name: "bosch",
        kind: "parts_manufacturer",
        ...timestamps,
      },
    ]);
    db.set("source", "part_number", [
      {
        id: "source_number",
        brand_id: "source_brand",
        number_type: "aftermarket",
        source_number: "F 026 407 123",
        display_number: "F 026 407 123",
        normalized_number: "F026407123",
        ...timestamps,
      },
    ]);

    const first = await mergeCatalogSchemas(db, "source", "target", options);
    const insertedNumber = db.data.get("target.part_number")?.[0];
    expect(first.tables.parts_brand).toEqual({
      scanned: 1,
      matched: 1,
      inserted: 0,
    });
    expect(insertedNumber?.brand_id).toBe("target_brand");

    const second = await mergeCatalogSchemas(db, "source", "target", options);
    expect(second.tables.part_number).toEqual({
      scanned: 1,
      matched: 1,
      inserted: 0,
    });
    expect(db.data.get("target.part_number")).toHaveLength(1);
  });

  it("keeps dry runs read-only and reports every mismatch", async () => {
    const db = new MemoryCatalog();
    initializeEmptyTables(db, "source");
    initializeEmptyTables(db, "target");
    db.set("source", "parts_brand", [
      {
        id: "source_brand",
        name: "Bosch",
        normalized_name: "bosch",
        kind: "parts_manufacturer",
        ...timestamps,
      },
    ]);
    db.set("target", "parts_brand", []);

    const report = await mergeCatalogSchemas(db, "source", "target", {
      ...options,
      dryRun: true,
    });

    expect(report.tables.parts_brand.inserted).toBe(1);
    expect(db.data.get("target.parts_brand")).toHaveLength(0);
  });

  it("remaps colliding IDs deterministically and carries the map to child rows", async () => {
    const db = new MemoryCatalog();
    initializeEmptyTables(db, "source");
    initializeEmptyTables(db, "target");
    db.set("source", "parts_brand", [
      {
        id: "source_brand",
        name: "Bosch",
        normalized_name: "bosch",
        kind: "parts_manufacturer",
        ...timestamps,
      },
    ]);
    db.set("target", "parts_brand", [
      {
        id: "target_brand",
        name: "Bosch",
        normalized_name: "bosch",
        kind: "parts_manufacturer",
        ...timestamps,
      },
    ]);
    db.set("source", "part_number", [
      {
        id: "colliding_number_id",
        brand_id: "source_brand",
        number_type: "aftermarket",
        source_number: "NEW-1",
        display_number: "NEW-1",
        normalized_number: "NEW1",
        ...timestamps,
      },
    ]);
    db.set("target", "part_number", [
      {
        id: "colliding_number_id",
        brand_id: "target_brand",
        number_type: "aftermarket",
        source_number: "OLD-1",
        display_number: "OLD-1",
        normalized_number: "OLD1",
        ...timestamps,
      },
    ]);
    db.set("source", "part_number_search_key", [
      {
        id: "source_search_key",
        part_number_id: "colliding_number_id",
        key: "NEW1",
        ...timestamps,
      },
    ]);

    const report = await mergeCatalogSchemas(db, "source", "target", options);
    const inserted = db.data
      .get("target.part_number")
      ?.find((row) => row.normalized_number === "NEW1");
    const insertedKey = db.data.get("target.part_number_search_key")?.[0];

    expect(report.conflicts).toEqual([]);
    expect(inserted?.id).toMatch(/^mrg_[a-f0-9]{32}$/);
    expect(insertedKey?.part_number_id).toBe(inserted?.id);
  });

  it("aborts on a natural-key collision with differing business values", async () => {
    const db = new MemoryCatalog();
    initializeEmptyTables(db, "source");
    initializeEmptyTables(db, "target");
    db.set("source", "parts_brand", [
      {
        id: "source_brand",
        name: "BOSCH",
        normalized_name: "bosch",
        kind: "parts_manufacturer",
        ...timestamps,
      },
    ]);
    db.set("target", "parts_brand", [
      {
        id: "target_brand",
        name: "Bosch Automotive",
        normalized_name: "bosch",
        kind: "parts_manufacturer",
        ...timestamps,
      },
    ]);

    const error = await mergeCatalogSchemas(
      db,
      "source",
      "target",
      options,
    ).then(
      () => null,
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(CatalogMergeError);
    if (!(error instanceof CatalogMergeError)) {
      throw error;
    }
    expect(error.report.conflicts).toContainEqual({
      table: "parts_brand",
      source_id: "source_brand",
      reason: "Natural-key match has differing business fields",
    });
  });

  it("refuses mismatched schemas before merging rows", async () => {
    const db = new MemoryCatalog();
    initializeEmptyTables(db, "source");
    initializeEmptyTables(db, "target");
    db.set("source", "parts_brand", [
      {
        id: "source_brand",
        name: "Bosch",
        normalized_name: "bosch",
        kind: "parts_manufacturer",
        ...timestamps,
      },
    ]);
    db.schemas.set("target.parts_brand", ["id", "normalized_name"]);

    await expect(
      mergeCatalogSchemas(db, "source", "target", options),
    ).rejects.toMatchObject({
      report: {
        conflicts: [
          {
            table: "parts_brand",
            reason:
              "Source and target table columns differ; apply matching schema migrations first",
          },
        ],
      },
    });
    expect(db.data.get("target.parts_brand")).toHaveLength(0);
  });
});
