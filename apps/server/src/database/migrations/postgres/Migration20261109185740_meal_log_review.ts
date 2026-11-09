import { Migration } from '@mikro-orm/migrations';

export class Migration20261109185740_meal_log_review extends Migration {

  override name = 'Migration20261109185740_meal_log_review';

  override up(): void | Promise<void> {
    this.addSql(`alter table "meal_logs" add column "status" text not null default 'logged';`);
    this.addSql(`alter table "meal_logs" add column "input_text" text null;`);
    this.addSql(`alter table "meal_logs" add column "input_photo_key" varchar(255) null;`);
    this.addSql(`alter table "meal_logs" add column "error" text null;`);
    this.addSql(`alter table "meal_logs" drop constraint "meal_logs_source_check";`);
    this.addSql(`alter table "meal_logs" add constraint "meal_logs_source_check" check ("source" in ('photo', 'text', 'recipe', 'manual'));`);
    this.addSql(`alter table "meal_logs" add constraint "meal_logs_status_check" check ("status" in ('processing', 'ready', 'failed', 'logged'));`);
    this.addSql(`create index "meal_logs_status_index" on "meal_logs" ("status");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop index "meal_logs_status_index";`);
    this.addSql(`alter table "meal_logs" drop constraint "meal_logs_status_check";`);
    this.addSql(`alter table "meal_logs" drop constraint "meal_logs_source_check";`);
    this.addSql(`alter table "meal_logs" add constraint "meal_logs_source_check" check ("source" in ('photo', 'recipe', 'manual'));`);
    this.addSql(`alter table "meal_logs" drop column "error";`);
    this.addSql(`alter table "meal_logs" drop column "input_photo_key";`);
    this.addSql(`alter table "meal_logs" drop column "input_text";`);
    this.addSql(`alter table "meal_logs" drop column "status";`);
  }

}
