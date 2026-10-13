import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261013151546 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "parts_source_document" drop constraint if exists "parts_source_document_request_key_body_sha256_unique";`);
    this.addSql(`create table if not exists "parts_source_document" ("id" text not null, "source_key" text not null, "source_name" text null, "parser_name" text null, "parser_version" text null, "brand" text null, "number" text null, "part_number_id" text null, "request_key" text not null, "method" text not null default 'GET', "url" text not null, "params" jsonb null, "http_status" integer null, "body" text not null, "body_sha256" text not null, "body_bytes" integer not null, "fetched_at" timestamptz not null, "last_seen_at" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "parts_source_document_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_parts_source_document_deleted_at" ON "parts_source_document" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_parts_source_document_request_key_body_sha256_unique" ON "parts_source_document" ("request_key", "body_sha256") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_parts_source_document_part_number_id" ON "parts_source_document" ("part_number_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_parts_source_document_source_key_fetched_at" ON "parts_source_document" ("source_key", "fetched_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "parts_source_document" cascade;`);
  }

}
