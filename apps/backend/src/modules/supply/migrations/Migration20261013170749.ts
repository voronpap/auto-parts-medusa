import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261013170749 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "supply_pricing_rule" ("id" text not null, "brand" text null, "normalized_brand" text null, "price_from_minor" integer null, "price_to_minor" integer null, "markup_bp" integer not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "supply_pricing_rule_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_supply_pricing_rule_deleted_at" ON "supply_pricing_rule" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_supply_pricing_rule_normalized_brand" ON "supply_pricing_rule" ("normalized_brand") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "supply_pricing_settings" ("id" text not null, "default_markup_bp" integer null, "rounding_minor" integer not null default 100, "sync_stock" boolean not null default true, "last_applied_at" timestamptz null, "last_result" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "supply_pricing_settings_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_supply_pricing_settings_deleted_at" ON "supply_pricing_settings" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "supply_pricing_rule" cascade;`);

    this.addSql(`drop table if exists "supply_pricing_settings" cascade;`);
  }

}
