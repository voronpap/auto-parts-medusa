import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261012155733 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_security_event_created_at" ON "security_event" ("created_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_security_event_type_created_at" ON "security_event" ("type", "created_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_security_event_created_at";`);
    this.addSql(`drop index if exists "IDX_security_event_type_created_at";`);
  }

}
