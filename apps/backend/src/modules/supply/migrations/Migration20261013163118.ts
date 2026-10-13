import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261013163118 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "supply_offer" drop constraint if exists "supply_offer_supplier_id_normalized_brand_normalized_number_unique";`);
    this.addSql(`alter table if exists "supply_supplier" drop constraint if exists "supply_supplier_normalized_name_unique";`);
    this.addSql(`create table if not exists "supply_supplier" ("id" text not null, "name" text not null, "normalized_name" text not null, "currency_code" text not null default 'uah', "lead_days" integer null, "note" text null, "is_active" boolean not null default true, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "supply_supplier_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_supply_supplier_deleted_at" ON "supply_supplier" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_supply_supplier_normalized_name_unique" ON "supply_supplier" ("normalized_name") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "supply_offer" ("id" text not null, "supplier_id" text not null, "brand" text not null, "number" text not null, "normalized_brand" text not null, "normalized_number" text not null, "part_number_id" text null, "title" text null, "price_minor" integer not null, "currency_code" text not null, "stock_quantity" integer null, "stock_text" text null, "lead_days" integer null, "is_listed" boolean not null default true, "last_run_id" text null, "last_seen_at" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "supply_offer_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_supply_offer_supplier_id" ON "supply_offer" ("supplier_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_supply_offer_deleted_at" ON "supply_offer" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_supply_offer_supplier_id_normalized_brand_normalized_number_unique" ON "supply_offer" ("supplier_id", "normalized_brand", "normalized_number") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_supply_offer_normalized_number" ON "supply_offer" ("normalized_number") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_supply_offer_part_number_id" ON "supply_offer" ("part_number_id") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "supply_offer_observation" ("id" text not null, "offer_id" text not null, "price_minor" integer not null, "currency_code" text not null, "stock_quantity" integer null, "is_listed" boolean not null default true, "run_id" text null, "observed_at" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "supply_offer_observation_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_supply_offer_observation_offer_id" ON "supply_offer_observation" ("offer_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_supply_offer_observation_deleted_at" ON "supply_offer_observation" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_supply_offer_observation_offer_id_observed_at" ON "supply_offer_observation" ("offer_id", "observed_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "supply_import_run" ("id" text not null, "supplier_id" text not null, "file_name" text null, "status" text check ("status" in ('open', 'finished')) not null default 'open', "rows_total" integer not null default 0, "rows_skipped" integer not null default 0, "offers_created" integer not null default 0, "offers_updated" integer not null default 0, "offers_unchanged" integer not null default 0, "offers_delisted" integer not null default 0, "offers_matched" integer not null default 0, "errors" jsonb null, "finished_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "supply_import_run_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_supply_import_run_supplier_id" ON "supply_import_run" ("supplier_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_supply_import_run_deleted_at" ON "supply_import_run" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "supply_offer" add constraint "supply_offer_supplier_id_foreign" foreign key ("supplier_id") references "supply_supplier" ("id") on update cascade;`);

    this.addSql(`alter table if exists "supply_offer_observation" add constraint "supply_offer_observation_offer_id_foreign" foreign key ("offer_id") references "supply_offer" ("id") on update cascade;`);

    this.addSql(`alter table if exists "supply_import_run" add constraint "supply_import_run_supplier_id_foreign" foreign key ("supplier_id") references "supply_supplier" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "supply_offer" drop constraint if exists "supply_offer_supplier_id_foreign";`);

    this.addSql(`alter table if exists "supply_import_run" drop constraint if exists "supply_import_run_supplier_id_foreign";`);

    this.addSql(`alter table if exists "supply_offer_observation" drop constraint if exists "supply_offer_observation_offer_id_foreign";`);

    this.addSql(`drop table if exists "supply_supplier" cascade;`);

    this.addSql(`drop table if exists "supply_offer" cascade;`);

    this.addSql(`drop table if exists "supply_offer_observation" cascade;`);

    this.addSql(`drop table if exists "supply_import_run" cascade;`);
  }

}
