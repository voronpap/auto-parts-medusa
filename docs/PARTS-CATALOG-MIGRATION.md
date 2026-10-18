# Parts catalog migration and cutover rules

This runbook covers moving the parts catalog from the local catalog backend to
the production backend while catalog collection continues. It is a procedure
and a set of release gates; it does **not** mean that a migration has been
executed.

## Current data flow

- Collectors run `tools/harvest.py --spool`. Parsed catalog results are
  appended to JSONL files under `harvest/spool/`.
- The uploader runs `tools/harvest.py --upload` and currently targets the
  local catalog API at `http://127.0.0.1:9100`. It reads
  `CATALOG_URL`/`CATALOG_API_KEY` from the parser `.env` unless overridden.
- Each JSONL file has a sibling `.pos` containing the byte offset of the next
  line to send. The spool files and their `.pos` files form one checkpoint.
- The production storefront and backend are separate from this local catalog.
  An upload to port 9100 is not a production write.

Relevant implementation: [`spool.py`](../apps/parsers/parsers/spool.py),
[`bulk.py`](../apps/parsers/parsers/bulk.py),
[`harvest.py`](../apps/parsers/tools/harvest.py) in the parser repository.
The Windows collector/uploader wrappers live alongside the parser checkout.
The catalog ingestion endpoint is
[`import/route.ts`](../apps/backend/src/api/admin/parts-catalog/import/route.ts)
and its workflow is
[`ingest-lookup-result.ts`](../apps/backend/src/workflows/parts-catalog/steps/ingest-lookup-result.ts).

## Non-negotiable rules

1. **Never replace the whole production Medusa database with the local one.**
   Production also owns live products, orders, customers, payments, inventory,
   and settings. Migrate only the explicitly approved parts-catalog tables.
2. **Do not delete or reset spool files or `.pos` files.** A JSONL file is
   parsed, not-yet-acknowledged work; it is not a disposable raw parser cache.
   Keep each `.pos` beside its original JSONL file and preserve both through
   cutover and rollback.
3. **Do not replay already acknowledged spool lines through the import API as
   a migration method.** The bulk import now has a logical idempotency receipt,
   but the receipt is not a replacement for the spool checkpoint or a
   reviewed catalog merge.
4. **Never run two uploaders against one spool directory.** They share
   `.pos` files and can race. Run exactly one uploader at a time.
5. **Do not claim zero data loss while there are refused/failed imports.**
   Permanent HTTP 4xx responses are now written to a per-line file under
   `dead-letter/` before `.pos` advances. The uploader reports the count and
   exits non-zero if any were recorded. Reconcile every such file before
   cutover; transient and ambiguous errors must remain queued at the cursor.
6. Keep parser caches and credentials on their existing hosts. Do not copy
   `.env`, API keys, or raw parser cache databases to production.

## Data scope

The production migration must be a reviewed, allow-listed merge of the
catalog's normalized records, not a full database restore. Preserve primary
keys and relationships, and map colliding IDs before inserting dependent rows.
The allow-list is based on the current parts-catalog module models:

- `parts_brand`, `parts_brand_alias`;
- `part_number`, `part_number_search_key`;
- `parts_source`, `parts_observation`;
- `part_relationship`, `part_relationship_evidence`;
- `part_application`, `part_attribute`, `part_image`;
- `vehicle_make`, `vehicle_make_alias`, `vehicle_model`,
  `vehicle_model_alias`;
- the Medusa ProductVariant-to-PartNumber link defined in
  [`product-variant-part-number.ts`](../apps/backend/src/links/product-variant-part-number.ts),
  after verifying its generated link table and destination product/variant IDs.

Unless separately approved, exclude:

- `parts_source_document`, because it contains raw upstream response bodies;
- `part_lookup_task`, because queue/worker state is transient;
- `parts_number_search`, because it is request/queue state, not catalog data;
- `parts_import_receipt`, because it is destination-local delivery state and
  must not be merged as catalog content;
- parser `.sqlite` caches, temporary lists, logs, and credentials.
- `dead-letter/` files are delivery exceptions, not catalog rows. Keep them
  outside the export and retain them until every line is reconciled.

For `part_image`, transfer source URLs only after deciding how destination
files are handled. A row marked `stored` may point to a file that exists only
on the source machine. Either migrate and verify that file in the destination
file store, or have a reviewed migration step reset that row to `pending` and
clear the old `file_url`. Do not copy a `stored` status with an unreachable
file reference.

## Required safeguards before the first production cutover

These are release gates, not optional cleanup. Dead-letter handling and
request-level receipts are implemented in the current code, but are not
production-ready until the code and migration are deployed and verified on an
isolated staging backend.

- Dead-letter handling retains the failed JSONL record, source filename, byte
  offset, and HTTP error before the cursor advances. Verify that the summary
  and non-zero exit are visible to the operator; reconcile every record.
- The import API derives a stable key from the normalized part identity and a
  canonical result hash. Worker identity and retrieval timestamps are excluded;
  the backend records the completion response plus spool filename/offset.
  Replays of a completed request return the stored response; an identical
  request still processing receives HTTP 409 and is not re-ingested. A receipt
  left in `processing` after a backend interruption requires manual
  reconciliation before retrying; do not reset it blindly.
- Run the staging merge rehearsal described below. It maps source IDs to
  target IDs by natural keys, remaps foreign keys, reports conflicts, and is
  re-runnable. The script refuses schema mismatches and never updates an
  existing target row.
- Test that the destination backend is running the matching parts-catalog
  schema migrations before importing rows.

Until the staging merge rehearsal and schema checks also pass, do not promise
exactly-once delivery or perform a live database cutover. No production
migration has been run.

## Staging merge rehearsal

`apps/backend/src/scripts/merge-parts-catalog-staging.ts` runs only against
two schemas in an isolated staging database: `catalog_source` (the normalized
catalog snapshot) and `catalog_target` (a staging copy of the destination
catalog). The target database must also contain the staging product/variant
rows in `public`, because product links are checked against those IDs.
Populate both schemas from compatible migrations and reviewed exports first;
do not include raw source documents, lookup queues, receipts, spool files,
credentials, or parser caches. This is a staging rehearsal tool, not a
production promotion command.

First run a read-only report:

```powershell
$env:CATALOG_MERGE_SOURCE_SCHEMA = "catalog_source"
$env:CATALOG_MERGE_TARGET_SCHEMA = "catalog_target"
pnpm exec medusa exec ./src/scripts/merge-parts-catalog-staging.ts
```

The script checks all required table/column sets and processes parent tables
before dependents in batches. Natural-key matches are reused only when their
business fields agree; source IDs are mapped to destination IDs and all
catalog foreign keys are rewritten. A source ID that collides with an
unrelated target row receives a deterministic `mrg_` ID. ProductVariant IDs
must already exist in the staging `public.product_variant` table. Conflicts
are reported as JSON and abort the merge; no target row is overwritten.

Review the full report, resolve every conflict, and verify counts, FK
integrity, photo reachability, and representative lookups. To apply a rehearsal
to the isolated staging target, connect to a database whose name contains a
`stage`, `staging`, `test`, or `rehearsal` token, then explicitly set all three
guards below. The write runs in a database transaction and rolls back on any
reported conflict:

```powershell
$env:CATALOG_MERGE_ENV = "staging"
$env:CATALOG_MERGE_CONFIRM = "staging"
$env:CATALOG_MERGE_APPLY = "yes"
pnpm exec medusa exec ./src/scripts/merge-parts-catalog-staging.ts
```

Run the same apply command a second time and verify that it inserts no
duplicates. Do not point this script at production. A temporary local
PostgreSQL rehearsal using snapshot-shaped schemas verified dry-run behavior,
natural-key ID mapping, deterministic ID collision remapping, dependent
foreign-key mapping (including the ProductVariant link), idempotent rerun,
conflict reporting, and transaction rollback. This is not a rehearsal against
the actual staging backend or a full catalog export; both still must be
verified before production cutover.

## Cutover procedure

### 1. Prepare and record a baseline

- Agree on source backend, production target, operator, change window, and
  rollback owner.
- Confirm collectors are in spool mode. They may continue running throughout
  the migration. No collector may write directly to either database during
  the cutover.
- Confirm the destination code/schema is compatible and all required
  migrations have been applied.
- Take and verify a restorable production database backup before any write.
- Record source and destination counts for every allow-listed table, including
  active/deleted rows separately. Record foreign-key checks and the chosen
  treatment of stored photos.
- Prepare an isolated staging database/schema and a migration manifest. The
  manifest must include table counts, source snapshot time, table/key
  mappings, rejected/conflicting rows, and checksums of exported files.

### 2. Establish a consistent spool/database boundary

- Stop only the periodic uploader. Do not stop collectors that are writing to
  spool.
- Wait until the uploader process and any child `upload-spool` process have
  exited. Verify no other uploader is running.
- Record, for every spool JSONL file, its exact `.pos` byte offset, file size,
  and checksum. Keep a copy of this checkpoint manifest outside the spool
  directory.
- Review uploader and collector logs. There must be zero unaccounted refused
  records or failed imports. Resolve each one through the
  dead-letter/reconciliation process before proceeding. A trailing JSONL line
  without a newline while a collector is writing is expected: it must not be
  consumed until the next upload pass sees the completed line.
- Confirm each saved `.pos` is no greater than its JSONL file size and points
  to a line boundary. Do not edit the cursor to make an upload appear caught
  up.
- With the uploader stopped, take a consistent snapshot of the local
  catalog. Collectors can keep appending to spool; those post-checkpoint lines
  are deliberately not part of this snapshot.

This boundary means: records before each saved `.pos` must be present in the
snapshot; records at or after it remain queued and must be delivered after
cutover.

### 3. Merge catalog data through staging

- Export only the approved table allow-list; do not export raw source-document
  bodies or unrelated Medusa tables.
- Load the export into staging, not directly into live production tables.
- Merge parents before dependents. Match existing records by reviewed natural
  keys (for example normalized brand name and
  `(brand, number_type, normalized_number)`), and build explicit old-ID to
  destination-ID mappings for every table with foreign keys.
- Preserve existing production records and their live state. Never overwrite
  production data merely because the source snapshot has a row with the same
  ID.
- Stop on any unreviewed natural-key collision, duplicate candidate,
  constraint violation, or unmapped foreign key. Do not resolve conflicts by
  deleting production rows.
- Verify destination counts and relationships against the migration manifest.
  Check duplicate natural keys, dangling references, image-file reachability,
  and representative search/fitment/photo queries.

### 4. Switch the uploader without replaying the baseline

- Keep the collectors in spool mode.
- Preserve the exact pre-cutover `.pos` checkpoint. Do not reset offsets to
  zero and do not regenerate spool filenames.
- Change only the uploader's destination to the production catalog API using
  the approved secret-management method. Do not print or copy the API key into
  logs, documentation, or chat.
- Start one uploader only. It must resume at the saved byte offsets and send
  only lines appended after the snapshot boundary.
- Monitor per-file cursor movement, success counts, dead-letter counts, API
  errors, production health, and one representative imported catalog record.
  Do not start a second uploader while the first is active.
- If any refused or ambiguous line occurs, stop promotion and reconcile it
  before declaring cutover complete.

### 5. Accept or roll back

Accept only when all conditions hold:

- production service and catalog API are healthy;
- every source line after the cutover offsets is either acknowledged exactly
  once or present in a reviewed dead-letter queue;
- there are no unaccounted refused/failed lines;
- production counts, key uniqueness, foreign keys, and representative product
  lookup/photo paths pass;
- the checkpoint and final migration manifests are archived with the release.

For rollback, do not delete spool data or blindly restore the entire production
database over live orders, customers, or other writes made since the backup.
Prefer a reviewed reverse of the catalog merge. Restore the full production
backup only in a coordinated recovery window after accounting for every
production write since that backup. Keep a copy of the cutover offsets so
post-cutover spool lines can be replayed to the source catalog if needed; do
not replay the baseline lines. Reconcile every line acknowledged by production
after cutover before routing writes elsewhere.

## After cutover

- Keep the former local database read-only until production has operated
  successfully through an agreed observation period and backups are verified.
- Keep spool files, `.pos` checkpoints, dead letters, logs, and manifests until
  all lines are reconciled and retention is approved.
- Resume normal collection only in spool mode. Route the single uploader to
  production; never have simultaneous local and production uploaders consume
  the same spool.
- Document the final source/destination, commit, backup reference, cursor
  checkpoint, counts, exceptions, and operator sign-off for every migration.
