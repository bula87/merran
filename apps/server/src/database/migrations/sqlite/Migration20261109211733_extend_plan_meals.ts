import { Migration } from '@mikro-orm/migrations';

export class Migration20261109211733_extend_plan_meals extends Migration {

  override name = 'Migration20261109211733_extend_plan_meals';

  override up(): void | Promise<void> {
    this.addSql(`pragma foreign_keys = off;`);
    this.addSql(`create table \`plan_slot_times__temp_alter\` (\`id\` text not null primary key, \`household_id\` text not null, \`date\` text not null, \`meal\` text check (\`meal\` in ('breakfast', 'morning-snack', 'lunch', 'afternoon-snack', 'dinner')) not null, \`start\` text not null, \`minutes\` integer not null, \`updated_at\` datetime not null, constraint \`plan_slot_times_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade);`);
    this.addSql(`insert into \`plan_slot_times__temp_alter\` select \`id\`, \`household_id\`, \`date\`, case when \`meal\` = 'snack' then 'afternoon-snack' else \`meal\` end, \`start\`, \`minutes\`, \`updated_at\` from \`plan_slot_times\`;`);
    this.addSql(`drop table \`plan_slot_times\`;`);
    this.addSql(`alter table \`plan_slot_times__temp_alter\` rename to \`plan_slot_times\`;`);
    this.addSql(`create index \`plan_slot_times_household_id_index\` on \`plan_slot_times\` (\`household_id\`);`);
    this.addSql(`create unique index \`plan_slot_times_household_id_date_meal_unique\` on \`plan_slot_times\` (\`household_id\`, \`date\`, \`meal\`);`);
    this.addSql(`pragma foreign_keys = on;`);

    this.addSql(`pragma foreign_keys = off;`);
    this.addSql(`create table \`plan_entries__temp_alter\` (\`id\` text not null primary key, \`household_id\` text not null, \`date\` text not null, \`any_day\` integer not null default false, \`meal\` text check (\`meal\` in ('breakfast', 'morning-snack', 'lunch', 'afternoon-snack', 'dinner')) not null, \`position\` integer not null default 0, \`recipe_id\` text null, \`with_recipe_id\` text null, \`note\` text null, \`servings\` double null, \`status\` text check (\`status\` in ('planned', 'cooked', 'skipped')) not null default 'planned', \`cooked_at\` datetime null, \`listed_at\` datetime null, \`pantry_used\` json null, \`variants\` json null, \`why\` json null, \`created_at\` datetime not null, \`updated_at\` datetime not null, constraint \`plan_entries_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade, constraint \`plan_entries_recipe_id_foreign\` foreign key (\`recipe_id\`) references \`recipes\` (\`id\`) on delete cascade, constraint \`plan_entries_with_recipe_id_foreign\` foreign key (\`with_recipe_id\`) references \`recipes\` (\`id\`) on delete set null);`);
    this.addSql(`insert into \`plan_entries__temp_alter\` select \`id\`, \`household_id\`, \`date\`, \`any_day\`, case when \`meal\` = 'snack' then 'afternoon-snack' else \`meal\` end, \`position\`, \`recipe_id\`, \`with_recipe_id\`, \`note\`, \`servings\`, \`status\`, \`cooked_at\`, \`listed_at\`, \`pantry_used\`, \`variants\`, \`why\`, \`created_at\`, \`updated_at\` from \`plan_entries\`;`);
    this.addSql(`drop table \`plan_entries\`;`);
    this.addSql(`alter table \`plan_entries__temp_alter\` rename to \`plan_entries\`;`);
    this.addSql(`create index \`plan_entries_household_id_index\` on \`plan_entries\` (\`household_id\`);`);
    this.addSql(`create index \`plan_entries_recipe_id_index\` on \`plan_entries\` (\`recipe_id\`);`);
    this.addSql(`create index \`plan_entries_with_recipe_id_index\` on \`plan_entries\` (\`with_recipe_id\`);`);
    this.addSql(`create index \`plan_entries_household_id_date_index\` on \`plan_entries\` (\`household_id\`, \`date\`);`);
    this.addSql(`pragma foreign_keys = on;`);
  }

  override down(): void | Promise<void> {

    this.addSql(`pragma foreign_keys = off;`);
    this.addSql(`create table \`plan_entries__temp_alter\` (\`any_day\` integer not null default false, \`cooked_at\` datetime null, \`created_at\` datetime not null, \`date\` text not null, \`household_id\` text not null, \`id\` text not null primary key, \`listed_at\` datetime null, \`meal\` text check (\`meal\` in ('breakfast', 'lunch', 'dinner', 'snack')) not null, \`note\` text null, \`pantry_used\` json null, \`position\` integer not null default 0, \`recipe_id\` text null, \`servings\` double null, \`status\` text check (\`status\` in ('planned', 'cooked', 'skipped')) not null default 'planned', \`updated_at\` datetime not null, \`variants\` json null, \`why\` json null, \`with_recipe_id\` text null, constraint \`plan_entries_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade, constraint \`plan_entries_recipe_id_foreign\` foreign key (\`recipe_id\`) references \`recipes\` (\`id\`) on delete cascade, constraint \`plan_entries_with_recipe_id_foreign\` foreign key (\`with_recipe_id\`) references \`recipes\` (\`id\`) on delete set null);`);
    this.addSql(`insert into \`plan_entries__temp_alter\` select \`any_day\`, \`cooked_at\`, \`created_at\`, \`date\`, \`household_id\`, \`id\`, \`listed_at\`, \`meal\`, \`note\`, \`pantry_used\`, \`position\`, \`recipe_id\`, \`servings\`, \`status\`, \`updated_at\`, \`variants\`, \`why\`, \`with_recipe_id\` from \`plan_entries\`;`);
    this.addSql(`drop table \`plan_entries\`;`);
    this.addSql(`alter table \`plan_entries__temp_alter\` rename to \`plan_entries\`;`);
    this.addSql(`create index \`plan_entries_household_id_date_index\` on \`plan_entries\` (\`household_id\`, \`date\`);`);
    this.addSql(`create index \`plan_entries_household_id_index\` on \`plan_entries\` (\`household_id\`);`);
    this.addSql(`create index \`plan_entries_recipe_id_index\` on \`plan_entries\` (\`recipe_id\`);`);
    this.addSql(`create index \`plan_entries_with_recipe_id_index\` on \`plan_entries\` (\`with_recipe_id\`);`);
    this.addSql(`pragma foreign_keys = on;`);

    this.addSql(`pragma foreign_keys = off;`);
    this.addSql(`create table \`plan_slot_times__temp_alter\` (\`date\` text not null, \`household_id\` text not null, \`id\` text not null primary key, \`meal\` text check (\`meal\` in ('breakfast', 'lunch', 'dinner', 'snack')) not null, \`minutes\` integer not null, \`start\` text not null, \`updated_at\` datetime not null, constraint \`plan_slot_times_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade);`);
    this.addSql(`insert into \`plan_slot_times__temp_alter\` select \`date\`, \`household_id\`, \`id\`, \`meal\`, \`minutes\`, \`start\`, \`updated_at\` from \`plan_slot_times\`;`);
    this.addSql(`drop table \`plan_slot_times\`;`);
    this.addSql(`alter table \`plan_slot_times__temp_alter\` rename to \`plan_slot_times\`;`);
    this.addSql(`create unique index \`plan_slot_times_household_id_date_meal_unique\` on \`plan_slot_times\` (\`household_id\`, \`date\`, \`meal\`);`);
    this.addSql(`create index \`plan_slot_times_household_id_index\` on \`plan_slot_times\` (\`household_id\`);`);
    this.addSql(`pragma foreign_keys = on;`);
  }

}
