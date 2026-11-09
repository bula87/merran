import { Migration } from '@mikro-orm/migrations';

export class Migration20261109001055_recipe_translations extends Migration {

  override name = 'Migration20261109001055_recipe_translations';

  override up(): void | Promise<void> {
    this.addSql(`create table "recipe_translations" ("id" uuid not null, "household_id" uuid not null, "recipe_id" uuid not null, "locale" varchar(255) not null, "name" varchar(255) not null, "description" text null, "yield_text" varchar(255) null, "notes" text null, "ingredients" jsonb not null, "steps" jsonb not null, "translated_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "recipe_translations_household_id_index" on "recipe_translations" ("household_id");`);
    this.addSql(`create index "recipe_translations_recipe_id_index" on "recipe_translations" ("recipe_id");`);
    this.addSql(`create index "recipe_translations_household_id_locale_index" on "recipe_translations" ("household_id", "locale");`);
    this.addSql(`alter table "recipe_translations" add constraint "recipe_translations_recipe_id_locale_unique" unique ("recipe_id", "locale");`);

    this.addSql(`alter table "recipe_translations" add constraint "recipe_translations_household_id_foreign" foreign key ("household_id") references "households" ("id") on delete cascade;`);
    this.addSql(`alter table "recipe_translations" add constraint "recipe_translations_recipe_id_foreign" foreign key ("recipe_id") references "recipes" ("id") on delete cascade;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "recipe_translations" cascade;`);
  }

}
