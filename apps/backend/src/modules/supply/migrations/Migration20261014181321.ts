import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261014181321 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "supply_parts_request" ("id" text not null, "name" text not null, "phone" text not null, "vin" text null, "car" text null, "message" text not null, "status" text check ("status" in ('new', 'in_progress', 'answered', 'closed')) not null default 'new', "note" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "supply_parts_request_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_supply_parts_request_deleted_at" ON "supply_parts_request" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_supply_parts_request_status_created_at" ON "supply_parts_request" ("status", "created_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "supply_parts_request" cascade;`);
  }

}
