import { Migration } from "@mikro-orm/migrations"

export class Migration20261109211734_extend_plan_meals extends Migration {
  override name = "Migration20261109211734_extend_plan_meals"

  override up(): void | Promise<void> {
    this.addSql(`alter table "plan_entries" drop constraint "plan_entries_meal_check";`)
    this.addSql(
      `update "plan_entries" set "meal" = 'afternoon-snack' where "meal" = 'snack';`
    )
    this.addSql(
      `alter table "plan_entries" add constraint "plan_entries_meal_check" check ("meal" in ('breakfast', 'morning-snack', 'lunch', 'afternoon-snack', 'dinner'));`
    )

    this.addSql(
      `alter table "plan_slot_times" drop constraint "plan_slot_times_meal_check";`
    )
    this.addSql(
      `update "plan_slot_times" set "meal" = 'afternoon-snack' where "meal" = 'snack';`
    )
    this.addSql(
      `alter table "plan_slot_times" add constraint "plan_slot_times_meal_check" check ("meal" in ('breakfast', 'morning-snack', 'lunch', 'afternoon-snack', 'dinner'));`
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "plan_entries" drop constraint "plan_entries_meal_check";`)
    this.addSql(
      `update "plan_entries" set "meal" = 'snack' where "meal" in ('morning-snack', 'afternoon-snack');`
    )
    this.addSql(
      `alter table "plan_entries" add constraint "plan_entries_meal_check" check ("meal" in ('breakfast', 'lunch', 'dinner', 'snack'));`
    )

    this.addSql(
      `alter table "plan_slot_times" drop constraint "plan_slot_times_meal_check";`
    )
    this.addSql(
      `update "plan_slot_times" set "meal" = 'snack' where "meal" in ('morning-snack', 'afternoon-snack');`
    )
    this.addSql(
      `alter table "plan_slot_times" add constraint "plan_slot_times_meal_check" check ("meal" in ('breakfast', 'lunch', 'dinner', 'snack'));`
    )
  }
}
