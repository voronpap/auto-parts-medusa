import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261013191752 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "parts_number_search" ("id" text not null, "query" text not null, "normalized_number" text not null, "status" text check ("status" in ('pending', 'done', 'failed')) not null default 'pending', "candidates" jsonb null, "errors" jsonb null, "worker" text null, "completed_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "parts_number_search_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_parts_number_search_deleted_at" ON "parts_number_search" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_parts_number_search_status_created_at" ON "parts_number_search" ("status", "created_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_parts_number_search_normalized_number" ON "parts_number_search" ("normalized_number") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "parts_number_search" cascade;`);
  }

}
