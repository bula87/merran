import { Migration } from '@mikro-orm/migrations';

export class Migration20261109170841_meal_logs extends Migration {

  override name = 'Migration20261109170841_meal_logs';

  override up(): void | Promise<void> {
    this.addSql(`create table "meal_logs" ("id" uuid not null, "household_id" uuid not null, "user_id" uuid null, "recipe_id" uuid null, "name" varchar(255) not null, "serving" varchar(255) null, "servings" double precision null, "logged_at" timestamptz not null, "source" text not null, "confidence" text null, "notes" text null, "calories" double precision null, "protein" double precision null, "carbs" double precision null, "fat" double precision null, "fiber" double precision null, "sugar" double precision null, "sodium" double precision null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "meal_logs_household_id_index" on "meal_logs" ("household_id");`);
    this.addSql(`create index "meal_logs_user_id_index" on "meal_logs" ("user_id");`);
    this.addSql(`create index "meal_logs_recipe_id_index" on "meal_logs" ("recipe_id");`);
    this.addSql(`create index "meal_logs_household_id_logged_at_index" on "meal_logs" ("household_id", "logged_at");`);

    this.addSql(`alter table "meal_logs" add constraint "meal_logs_household_id_foreign" foreign key ("household_id") references "households" ("id") on delete cascade;`);
    this.addSql(`alter table "meal_logs" add constraint "meal_logs_user_id_foreign" foreign key ("user_id") references "users" ("id") on delete set null;`);
    this.addSql(`alter table "meal_logs" add constraint "meal_logs_recipe_id_foreign" foreign key ("recipe_id") references "recipes" ("id") on delete cascade;`);
    this.addSql(`alter table "meal_logs" add constraint "meal_logs_source_check" check ("source" in ('photo', 'recipe', 'manual'));`);
    this.addSql(`alter table "meal_logs" add constraint "meal_logs_confidence_check" check ("confidence" in ('low', 'medium', 'high'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "meal_logs" cascade;`);
  }

}
