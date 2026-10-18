import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261016162500 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "parts_import_receipt" (
        "id" text not null,
        "idempotency_key" text not null,
        "request_hash" text not null,
        "status" text check ("status" in ('processing', 'completed')) not null default 'processing',
        "response" jsonb null,
        "source_file" text null,
        "source_offset" text null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "parts_import_receipt_pkey" primary key ("id")
      );`
    )
    this.addSql(
      `create index if not exists "IDX_parts_import_receipt_deleted_at"
        on "parts_import_receipt" ("deleted_at") where deleted_at is null;`
    )
    this.addSql(
      `create unique index if not exists "IDX_parts_import_receipt_idempotency_key_unique"
        on "parts_import_receipt" ("idempotency_key");`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "parts_import_receipt" cascade;`)
  }
}
