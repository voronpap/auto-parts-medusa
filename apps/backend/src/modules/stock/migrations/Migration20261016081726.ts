import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261016081726 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "stock_hold" ("id" text not null, "cart_id" text not null, "line_item_id" text not null, "variant_id" text not null, "inventory_item_id" text not null, "quantity" integer not null, "expires_at" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "stock_hold_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_stock_hold_deleted_at" ON "stock_hold" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_stock_hold_inventory_item_id_expires_at" ON "stock_hold" ("inventory_item_id", "expires_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_stock_hold_cart_id" ON "stock_hold" ("cart_id") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "stock_settings" ("id" text not null, "hold_minutes" integer not null default 15, "backorder_label" text not null default 'Під замовлення', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "stock_settings_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_stock_settings_deleted_at" ON "stock_settings" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "stock_hold" cascade;`);

    this.addSql(`drop table if exists "stock_settings" cascade;`);
  }

}
