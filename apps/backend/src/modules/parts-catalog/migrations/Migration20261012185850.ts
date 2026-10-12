import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261012185850 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "part_lookup_task" ("id" text not null, "part_number_id" text not null, "status" text check ("status" in ('pending', 'claimed', 'done', 'failed')) not null default 'pending', "worker" text null, "claimed_at" timestamptz null, "completed_at" timestamptz null, "summary" jsonb null, "errors" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "part_lookup_task_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_part_lookup_task_part_number_id" ON "part_lookup_task" ("part_number_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_part_lookup_task_deleted_at" ON "part_lookup_task" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_part_lookup_task_status_created_at" ON "part_lookup_task" ("status", "created_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "part_attribute" ("id" text not null, "part_number_id" text not null, "observation_id" text not null, "name" text not null, "value" text not null, "unit" text null, "raw_text" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "part_attribute_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_part_attribute_part_number_id" ON "part_attribute" ("part_number_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_part_attribute_observation_id" ON "part_attribute" ("observation_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_part_attribute_deleted_at" ON "part_attribute" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "part_application" ("id" text not null, "part_number_id" text not null, "observation_id" text not null, "applicability_verdict" text check ("applicability_verdict" in ('ACCEPTED', 'CONDITIONAL', 'CANDIDATE', 'REJECTED', 'UNRESOLVED')) not null default 'CANDIDATE', "make" text not null, "model" text null, "generation" text null, "body" text null, "market" text null, "year_from" integer null, "year_to" integer null, "engine" text null, "engine_code" text null, "power_kw" integer null, "fuel" text null, "drivetrain" text null, "transmission" text null, "position" text null, "side" text null, "quantity" integer null, "constraints" jsonb null, "raw_text" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "part_application_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_part_application_part_number_id" ON "part_application" ("part_number_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_part_application_observation_id" ON "part_application" ("observation_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_part_application_deleted_at" ON "part_application" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_part_application_make_model" ON "part_application" ("make", "model") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "part_lookup_task" add constraint "part_lookup_task_part_number_id_foreign" foreign key ("part_number_id") references "part_number" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table if exists "part_attribute" add constraint "part_attribute_part_number_id_foreign" foreign key ("part_number_id") references "part_number" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table if exists "part_attribute" add constraint "part_attribute_observation_id_foreign" foreign key ("observation_id") references "parts_observation" ("id") on update cascade;`);

    this.addSql(`alter table if exists "part_application" add constraint "part_application_part_number_id_foreign" foreign key ("part_number_id") references "part_number" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table if exists "part_application" add constraint "part_application_observation_id_foreign" foreign key ("observation_id") references "parts_observation" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "part_lookup_task" cascade;`);

    this.addSql(`drop table if exists "part_attribute" cascade;`);

    this.addSql(`drop table if exists "part_application" cascade;`);
  }

}
