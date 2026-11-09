import { Migration } from '@mikro-orm/migrations';

export class Migration20261109001017_recipe_translations extends Migration {

  override name = 'Migration20261109001017_recipe_translations';

  override up(): void | Promise<void> {
    this.addSql(`create table \`recipe_translations\` (\`id\` text not null primary key, \`household_id\` text not null, \`recipe_id\` text not null, \`locale\` text not null, \`name\` text not null, \`description\` text null, \`yield_text\` text null, \`notes\` text null, \`ingredients\` json not null, \`steps\` json not null, \`translated_at\` datetime not null, \`updated_at\` datetime not null, constraint \`recipe_translations_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade, constraint \`recipe_translations_recipe_id_foreign\` foreign key (\`recipe_id\`) references \`recipes\` (\`id\`) on delete cascade);`);
    this.addSql(`create index \`recipe_translations_household_id_index\` on \`recipe_translations\` (\`household_id\`);`);
    this.addSql(`create index \`recipe_translations_recipe_id_index\` on \`recipe_translations\` (\`recipe_id\`);`);
    this.addSql(`create index \`recipe_translations_household_id_locale_index\` on \`recipe_translations\` (\`household_id\`, \`locale\`);`);
    this.addSql(`create unique index \`recipe_translations_recipe_id_locale_unique\` on \`recipe_translations\` (\`recipe_id\`, \`locale\`);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists \`recipe_translations\`;`);
  }

}
