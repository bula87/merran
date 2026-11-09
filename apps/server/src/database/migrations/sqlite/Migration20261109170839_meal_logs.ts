import { Migration } from '@mikro-orm/migrations';

export class Migration20261109170839_meal_logs extends Migration {

  override name = 'Migration20261109170839_meal_logs';

  override up(): void | Promise<void> {
    this.addSql(`create table \`meal_logs\` (\`id\` text not null primary key, \`household_id\` text not null, \`user_id\` text null, \`recipe_id\` text null, \`name\` text not null, \`serving\` text null, \`servings\` double null, \`logged_at\` datetime not null, \`source\` text check (\`source\` in ('photo', 'recipe', 'manual')) not null, \`confidence\` text check (\`confidence\` in ('low', 'medium', 'high')) null, \`notes\` text null, \`calories\` double null, \`protein\` double null, \`carbs\` double null, \`fat\` double null, \`fiber\` double null, \`sugar\` double null, \`sodium\` double null, \`created_at\` datetime not null, constraint \`meal_logs_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade, constraint \`meal_logs_user_id_foreign\` foreign key (\`user_id\`) references \`users\` (\`id\`) on delete set null, constraint \`meal_logs_recipe_id_foreign\` foreign key (\`recipe_id\`) references \`recipes\` (\`id\`) on delete cascade);`);
    this.addSql(`create index \`meal_logs_household_id_index\` on \`meal_logs\` (\`household_id\`);`);
    this.addSql(`create index \`meal_logs_user_id_index\` on \`meal_logs\` (\`user_id\`);`);
    this.addSql(`create index \`meal_logs_recipe_id_index\` on \`meal_logs\` (\`recipe_id\`);`);
    this.addSql(`create index \`meal_logs_household_id_logged_at_index\` on \`meal_logs\` (\`household_id\`, \`logged_at\`);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists \`meal_logs\`;`);
  }

}
