import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261012155550 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "security_event" ("id" text not null, "type" text not null, "severity" text not null, "source" text not null, "ip" text null, "method" text null, "path" text null, "status" integer null, "request_id" text null, "actor_id" text null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "security_event_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_security_event_deleted_at" ON "security_event" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "security_event" cascade;`);
  }

}
