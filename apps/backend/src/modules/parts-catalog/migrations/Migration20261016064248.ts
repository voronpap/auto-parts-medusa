import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261016064248 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "part_image" ("id" text not null, "part_number_id" text not null, "observation_id" text not null, "source_url" text not null, "position" integer not null default 0, "status" text check ("status" in ('pending', 'stored', 'failed', 'skipped')) not null default 'pending', "file_url" text null, "attempts" integer not null default 0, "error" text null, "fetched_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "part_image_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_part_image_part_number_id" ON "part_image" ("part_number_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_part_image_observation_id" ON "part_image" ("observation_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_part_image_deleted_at" ON "part_image" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_part_image_part_number_id_status" ON "part_image" ("part_number_id", "status") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "part_image" add constraint "part_image_part_number_id_foreign" foreign key ("part_number_id") references "part_number" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table if exists "part_image" add constraint "part_image_observation_id_foreign" foreign key ("observation_id") references "parts_observation" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "part_image" cascade;`);
  }

}
