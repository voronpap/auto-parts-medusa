import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261012192317 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "vehicle_model_alias" drop constraint if exists "vehicle_model_alias_model_id_normalized_alias_unique";`);
    this.addSql(`alter table if exists "vehicle_model" drop constraint if exists "vehicle_model_make_id_normalized_name_unique";`);
    this.addSql(`alter table if exists "vehicle_make_alias" drop constraint if exists "vehicle_make_alias_normalized_alias_unique";`);
    this.addSql(`alter table if exists "vehicle_make" drop constraint if exists "vehicle_make_normalized_name_unique";`);
    this.addSql(`create table if not exists "vehicle_make" ("id" text not null, "name" text not null, "normalized_name" text not null, "needs_review" boolean not null default false, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "vehicle_make_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vehicle_make_deleted_at" ON "vehicle_make" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_vehicle_make_normalized_name_unique" ON "vehicle_make" ("normalized_name") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "vehicle_make_alias" ("id" text not null, "alias" text not null, "normalized_alias" text not null, "make_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "vehicle_make_alias_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vehicle_make_alias_make_id" ON "vehicle_make_alias" ("make_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vehicle_make_alias_deleted_at" ON "vehicle_make_alias" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_vehicle_make_alias_normalized_alias_unique" ON "vehicle_make_alias" ("normalized_alias") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "vehicle_model" ("id" text not null, "make_id" text not null, "name" text not null, "normalized_name" text not null, "needs_review" boolean not null default false, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "vehicle_model_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vehicle_model_make_id" ON "vehicle_model" ("make_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vehicle_model_deleted_at" ON "vehicle_model" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_vehicle_model_make_id_normalized_name_unique" ON "vehicle_model" ("make_id", "normalized_name") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "vehicle_model_alias" ("id" text not null, "alias" text not null, "normalized_alias" text not null, "model_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "vehicle_model_alias_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vehicle_model_alias_model_id" ON "vehicle_model_alias" ("model_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vehicle_model_alias_deleted_at" ON "vehicle_model_alias" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_vehicle_model_alias_model_id_normalized_alias_unique" ON "vehicle_model_alias" ("model_id", "normalized_alias") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vehicle_model_alias_normalized_alias" ON "vehicle_model_alias" ("normalized_alias") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "vehicle_make_alias" add constraint "vehicle_make_alias_make_id_foreign" foreign key ("make_id") references "vehicle_make" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table if exists "vehicle_model" add constraint "vehicle_model_make_id_foreign" foreign key ("make_id") references "vehicle_make" ("id") on update cascade;`);

    this.addSql(`alter table if exists "vehicle_model_alias" add constraint "vehicle_model_alias_model_id_foreign" foreign key ("model_id") references "vehicle_model" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table if exists "part_application" add column if not exists "vehicle_make_id" text null, add column if not exists "vehicle_model_id" text null;`);
    this.addSql(`alter table if exists "part_application" add constraint "part_application_vehicle_make_id_foreign" foreign key ("vehicle_make_id") references "vehicle_make" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table if exists "part_application" add constraint "part_application_vehicle_model_id_foreign" foreign key ("vehicle_model_id") references "vehicle_model" ("id") on update cascade on delete set null;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_part_application_vehicle_make_id" ON "part_application" ("vehicle_make_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_part_application_vehicle_model_id" ON "part_application" ("vehicle_model_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "vehicle_make_alias" drop constraint if exists "vehicle_make_alias_make_id_foreign";`);

    this.addSql(`alter table if exists "vehicle_model" drop constraint if exists "vehicle_model_make_id_foreign";`);

    this.addSql(`alter table if exists "part_application" drop constraint if exists "part_application_vehicle_make_id_foreign";`);

    this.addSql(`alter table if exists "part_application" drop constraint if exists "part_application_vehicle_model_id_foreign";`);

    this.addSql(`alter table if exists "vehicle_model_alias" drop constraint if exists "vehicle_model_alias_model_id_foreign";`);

    this.addSql(`drop table if exists "vehicle_make" cascade;`);

    this.addSql(`drop table if exists "vehicle_make_alias" cascade;`);

    this.addSql(`drop table if exists "vehicle_model" cascade;`);

    this.addSql(`drop table if exists "vehicle_model_alias" cascade;`);

    this.addSql(`drop index if exists "IDX_part_application_vehicle_make_id";`);
    this.addSql(`drop index if exists "IDX_part_application_vehicle_model_id";`);
    this.addSql(`alter table if exists "part_application" drop column if exists "vehicle_make_id", drop column if exists "vehicle_model_id";`);
  }

}
