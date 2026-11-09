import { Migration } from '@mikro-orm/migrations';

export class Migration20261109185739_meal_log_review extends Migration {

  override name = 'Migration20261109185739_meal_log_review';

  override up(): void | Promise<void> {
    this.addSql(`pragma foreign_keys = off;`);
    this.addSql(`create table \`meal_logs__temp_alter\` (\`id\` text not null primary key, \`household_id\` text not null, \`user_id\` text null, \`recipe_id\` text null, \`status\` text check (\`status\` in ('processing', 'ready', 'failed', 'logged')) not null default 'logged', \`name\` text not null, \`serving\` text null, \`servings\` double null, \`logged_at\` datetime not null, \`source\` text check (\`source\` in ('photo', 'text', 'recipe', 'manual')) not null, \`confidence\` text check (\`confidence\` in ('low', 'medium', 'high')) null, \`notes\` text null, \`input_text\` text null, \`input_photo_key\` text null, \`error\` text null, \`calories\` double null, \`protein\` double null, \`carbs\` double null, \`fat\` double null, \`fiber\` double null, \`sugar\` double null, \`sodium\` double null, \`created_at\` datetime not null, constraint \`meal_logs_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade, constraint \`meal_logs_user_id_foreign\` foreign key (\`user_id\`) references \`users\` (\`id\`) on delete set null, constraint \`meal_logs_recipe_id_foreign\` foreign key (\`recipe_id\`) references \`recipes\` (\`id\`) on delete cascade);`);
    this.addSql(`insert into \`meal_logs__temp_alter\` select \`id\`, \`household_id\`, \`user_id\`, \`recipe_id\`, 'logged' as \`status\`, \`name\`, \`serving\`, \`servings\`, \`logged_at\`, \`source\`, \`confidence\`, \`notes\`, null as \`input_text\`, null as \`input_photo_key\`, null as \`error\`, \`calories\`, \`protein\`, \`carbs\`, \`fat\`, \`fiber\`, \`sugar\`, \`sodium\`, \`created_at\` from \`meal_logs\`;`);
    this.addSql(`drop table \`meal_logs\`;`);
    this.addSql(`alter table \`meal_logs__temp_alter\` rename to \`meal_logs\`;`);
    this.addSql(`create index \`meal_logs_household_id_index\` on \`meal_logs\` (\`household_id\`);`);
    this.addSql(`create index \`meal_logs_user_id_index\` on \`meal_logs\` (\`user_id\`);`);
    this.addSql(`create index \`meal_logs_recipe_id_index\` on \`meal_logs\` (\`recipe_id\`);`);
    this.addSql(`create index \`meal_logs_household_id_logged_at_index\` on \`meal_logs\` (\`household_id\`, \`logged_at\`);`);
    this.addSql(`create index \`meal_logs_status_index\` on \`meal_logs\` (\`status\`);`);
    this.addSql(`pragma foreign_keys = on;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`pragma foreign_keys = off;`);
    this.addSql(`create table \`meal_logs__temp_alter\` (\`calories\` double null, \`carbs\` double null, \`confidence\` text check (\`confidence\` in ('low', 'medium', 'high')) null, \`created_at\` datetime not null, \`fat\` double null, \`fiber\` double null, \`household_id\` text not null, \`id\` text not null primary key, \`logged_at\` datetime not null, \`name\` text not null, \`notes\` text null, \`protein\` double null, \`recipe_id\` text null, \`serving\` text null, \`servings\` double null, \`sodium\` double null, \`source\` text check (\`source\` in ('photo', 'recipe', 'manual')) not null, \`sugar\` double null, \`user_id\` text null, constraint \`meal_logs_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade, constraint \`meal_logs_recipe_id_foreign\` foreign key (\`recipe_id\`) references \`recipes\` (\`id\`) on delete cascade, constraint \`meal_logs_user_id_foreign\` foreign key (\`user_id\`) references \`users\` (\`id\`) on delete set null);`);
    this.addSql(`insert into \`meal_logs__temp_alter\` select \`calories\`, \`carbs\`, \`confidence\`, \`created_at\`, \`fat\`, \`fiber\`, \`household_id\`, \`id\`, \`logged_at\`, \`name\`, \`notes\`, \`protein\`, \`recipe_id\`, \`serving\`, \`servings\`, \`sodium\`, \`source\`, \`sugar\`, \`user_id\` from \`meal_logs\`;`);
    this.addSql(`drop table \`meal_logs\`;`);
    this.addSql(`alter table \`meal_logs__temp_alter\` rename to \`meal_logs\`;`);
    this.addSql(`create index \`meal_logs_household_id_index\` on \`meal_logs\` (\`household_id\`);`);
    this.addSql(`create index \`meal_logs_household_id_logged_at_index\` on \`meal_logs\` (\`household_id\`, \`logged_at\`);`);
    this.addSql(`create index \`meal_logs_recipe_id_index\` on \`meal_logs\` (\`recipe_id\`);`);
    this.addSql(`create index \`meal_logs_user_id_index\` on \`meal_logs\` (\`user_id\`);`);
    this.addSql(`pragma foreign_keys = on;`);
  }

}
