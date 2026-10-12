import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261012182845 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "part_relationship_evidence" drop constraint if exists "part_relationship_evidence_relationship_id_observation_id_unique";`);
    this.addSql(`alter table if exists "parts_source" drop constraint if exists "parts_source_name_unique";`);
    this.addSql(`alter table if exists "parts_brand_alias" drop constraint if exists "parts_brand_alias_normalized_alias_unique";`);
    this.addSql(`alter table if exists "part_number_search_key" drop constraint if exists "part_number_search_key_part_number_id_key_unique";`);
    this.addSql(`alter table if exists "part_number" drop constraint if exists "part_number_brand_id_number_type_normalized_number_unique";`);
    this.addSql(`alter table if exists "parts_brand" drop constraint if exists "parts_brand_normalized_name_unique";`);
    this.addSql(`create table if not exists "parts_brand" ("id" text not null, "name" text not null, "normalized_name" text not null, "kind" text check ("kind" in ('vehicle_manufacturer', 'parts_manufacturer', 'supplier')) not null default 'parts_manufacturer', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "parts_brand_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_parts_brand_deleted_at" ON "parts_brand" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_parts_brand_normalized_name_unique" ON "parts_brand" ("normalized_name") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "part_number" ("id" text not null, "brand_id" text not null, "number_type" text check ("number_type" in ('oem', 'oes', 'aftermarket', 'supplier', 'trade', 'gtin', 'competitor')) not null, "source_number" text not null, "display_number" text not null, "normalized_number" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "part_number_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_part_number_brand_id" ON "part_number" ("brand_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_part_number_deleted_at" ON "part_number" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_part_number_brand_id_number_type_normalized_number_unique" ON "part_number" ("brand_id", "number_type", "normalized_number") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "part_relationship" ("id" text not null, "from_part_number_id" text not null, "to_part_number_id" text null, "relation_type" text check ("relation_type" in ('OEM_REFERENCE', 'SUPPLIER_REFERENCE', 'COMPETITOR_REFERENCE', 'TRADE_NUMBER', 'GTIN_IDENTIFIER', 'SUPERSEDED_BY', 'REPLACED_BY_KIT', 'REPLACED_BY_GROUP', 'DISCONTINUED_NO_REPLACEMENT', 'REMAN_OF', 'MANUFACTURER_INTERCHANGE', 'AFTERMARKET_CROSS', 'SHARED_APPLICATION_CANDIDATE', 'SPEC_MATCH_CANDIDATE', 'VISUAL_OR_TEXT_CANDIDATE', 'CONTAINS', 'ACCESSORY_FOR', 'REQUIRES', 'MATES_WITH', 'MIRRORED_VARIANT_OF', 'NOT_APPLICABLE_TO')) not null, "relationship_state" text check ("relationship_state" in ('ASSERTED', 'INFERRED_CANDIDATE', 'DISPUTED', 'RETRACTED')) not null default 'ASSERTED', "applicability_verdict" text check ("applicability_verdict" in ('ACCEPTED', 'CONDITIONAL', 'CANDIDATE', 'REJECTED', 'UNRESOLVED')) not null default 'UNRESOLVED', "constraints" jsonb null, "reason" text null, "valid_from" timestamptz null, "valid_to" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "part_relationship_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_part_relationship_from_part_number_id" ON "part_relationship" ("from_part_number_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_part_relationship_to_part_number_id" ON "part_relationship" ("to_part_number_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_part_relationship_deleted_at" ON "part_relationship" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_part_relationship_from_part_number_id_relation_type" ON "part_relationship" ("from_part_number_id", "relation_type") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_part_relationship_to_part_number_id_relation_type" ON "part_relationship" ("to_part_number_id", "relation_type") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "part_number_search_key" ("id" text not null, "key" text not null, "part_number_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "part_number_search_key_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_part_number_search_key_part_number_id" ON "part_number_search_key" ("part_number_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_part_number_search_key_deleted_at" ON "part_number_search_key" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_part_number_search_key_key" ON "part_number_search_key" ("key") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_part_number_search_key_part_number_id_key_unique" ON "part_number_search_key" ("part_number_id", "key") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "parts_brand_alias" ("id" text not null, "alias" text not null, "normalized_alias" text not null, "brand_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "parts_brand_alias_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_parts_brand_alias_brand_id" ON "parts_brand_alias" ("brand_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_parts_brand_alias_deleted_at" ON "parts_brand_alias" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_parts_brand_alias_normalized_alias_unique" ON "parts_brand_alias" ("normalized_alias") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "parts_source" ("id" text not null, "name" text not null, "kind" text check ("kind" in ('oem_catalog', 'manufacturer_catalog', 'licensed_database', 'open_database', 'supplier_price', 'workshop', 'user', 'ai')) not null, "license_class" text check ("license_class" in ('OPEN', 'LICENSED', 'CACHE_LIMITED', 'REFERENCE_ONLY', 'USER_PROVIDED', 'WORKSHOP')) not null, "lineage" text not null, "url" text null, "license_note" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "parts_source_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_parts_source_deleted_at" ON "parts_source" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_parts_source_name_unique" ON "parts_source" ("name") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_parts_source_lineage" ON "parts_source" ("lineage") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "parts_observation" ("id" text not null, "source_id" text not null, "record_ref" text null, "url" text null, "catalog_version" text null, "parser_version" text null, "retrieved_at" timestamptz not null, "status" text check ("status" in ('active', 'stale', 'retracted', 'deleted_at_source')) not null default 'active', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "parts_observation_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_parts_observation_source_id" ON "parts_observation" ("source_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_parts_observation_deleted_at" ON "parts_observation" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_parts_observation_source_id_status" ON "parts_observation" ("source_id", "status") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "part_relationship_evidence" ("id" text not null, "relationship_id" text not null, "observation_id" text not null, "raw_relation_text" text null, "source_semantics" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "part_relationship_evidence_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_part_relationship_evidence_relationship_id" ON "part_relationship_evidence" ("relationship_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_part_relationship_evidence_observation_id" ON "part_relationship_evidence" ("observation_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_part_relationship_evidence_deleted_at" ON "part_relationship_evidence" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_part_relationship_evidence_relationship_id_observation_id_unique" ON "part_relationship_evidence" ("relationship_id", "observation_id") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "part_number" add constraint "part_number_brand_id_foreign" foreign key ("brand_id") references "parts_brand" ("id") on update cascade;`);

    this.addSql(`alter table if exists "part_relationship" add constraint "part_relationship_from_part_number_id_foreign" foreign key ("from_part_number_id") references "part_number" ("id") on update cascade;`);
    this.addSql(`alter table if exists "part_relationship" add constraint "part_relationship_to_part_number_id_foreign" foreign key ("to_part_number_id") references "part_number" ("id") on update cascade on delete set null;`);

    this.addSql(`alter table if exists "part_number_search_key" add constraint "part_number_search_key_part_number_id_foreign" foreign key ("part_number_id") references "part_number" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table if exists "parts_brand_alias" add constraint "parts_brand_alias_brand_id_foreign" foreign key ("brand_id") references "parts_brand" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table if exists "parts_observation" add constraint "parts_observation_source_id_foreign" foreign key ("source_id") references "parts_source" ("id") on update cascade;`);

    this.addSql(`alter table if exists "part_relationship_evidence" add constraint "part_relationship_evidence_relationship_id_foreign" foreign key ("relationship_id") references "part_relationship" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table if exists "part_relationship_evidence" add constraint "part_relationship_evidence_observation_id_foreign" foreign key ("observation_id") references "parts_observation" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "part_number" drop constraint if exists "part_number_brand_id_foreign";`);

    this.addSql(`alter table if exists "parts_brand_alias" drop constraint if exists "parts_brand_alias_brand_id_foreign";`);

    this.addSql(`alter table if exists "part_relationship" drop constraint if exists "part_relationship_from_part_number_id_foreign";`);

    this.addSql(`alter table if exists "part_relationship" drop constraint if exists "part_relationship_to_part_number_id_foreign";`);

    this.addSql(`alter table if exists "part_number_search_key" drop constraint if exists "part_number_search_key_part_number_id_foreign";`);

    this.addSql(`alter table if exists "part_relationship_evidence" drop constraint if exists "part_relationship_evidence_relationship_id_foreign";`);

    this.addSql(`alter table if exists "parts_observation" drop constraint if exists "parts_observation_source_id_foreign";`);

    this.addSql(`alter table if exists "part_relationship_evidence" drop constraint if exists "part_relationship_evidence_observation_id_foreign";`);

    this.addSql(`drop table if exists "parts_brand" cascade;`);

    this.addSql(`drop table if exists "part_number" cascade;`);

    this.addSql(`drop table if exists "part_relationship" cascade;`);

    this.addSql(`drop table if exists "part_number_search_key" cascade;`);

    this.addSql(`drop table if exists "parts_brand_alias" cascade;`);

    this.addSql(`drop table if exists "parts_source" cascade;`);

    this.addSql(`drop table if exists "parts_observation" cascade;`);

    this.addSql(`drop table if exists "part_relationship_evidence" cascade;`);
  }

}
