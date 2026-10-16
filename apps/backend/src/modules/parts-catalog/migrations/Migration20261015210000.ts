import { Migration } from "@medusajs/framework/mikro-orm/migrations";

// Search by the start of a number ("0986" finds "0 986 424 797"). The plain
// index on "key" follows the database collation, which LIKE 'prefix%' cannot
// use; text_pattern_ops compares bytes, so the prefix lookup stays an index scan.
export class Migration20261015210000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_part_number_search_key_key_prefix" ON "part_number_search_key" ("key" text_pattern_ops) WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_part_number_search_key_key_prefix";`);
  }

}
