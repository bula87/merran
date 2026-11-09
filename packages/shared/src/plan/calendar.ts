import { MEALS, type Meal } from "./days.ts"

export type MealTime = { start: string; minutes: number }
export type MealTimes = Record<Meal, MealTime>

/** Local household times used until a dated meal has its own time. */
export const DEFAULT_MEAL_TIMES: MealTimes = {
  breakfast: { start: "08:00", minutes: 30 },
  "morning-snack": { start: "10:30", minutes: 20 },
  lunch: { start: "12:30", minutes: 45 },
  "afternoon-snack": { start: "15:30", minutes: 20 },
  dinner: { start: "18:30", minutes: 60 },
}

export function mealTimes(
  saved: Partial<Record<string, MealTime>> | undefined
): MealTimes {
  const legacySnack = saved?.snack
  return Object.fromEntries(
    MEALS.map((meal) => [
      meal,
      saved?.[meal] ??
        (meal === "afternoon-snack" ? legacySnack : undefined) ??
        DEFAULT_MEAL_TIMES[meal],
    ])
  ) as MealTimes
}
