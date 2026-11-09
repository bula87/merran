import { roundNutrient, type NutrientKey } from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { AppError } from "../../core/errors.ts"
import { toNumber } from "../../database/numbers.ts"
import { MealLog, Recipe } from "../../database/entities/index.ts"
import type { MealLogInput } from "../../http/schemas/meal-logs.ts"

export type MealLogDto = {
  id: string
  name: string
  serving: string | null
  servings: number | null
  loggedAt: string
  source: "photo" | "recipe" | "manual"
  confidence: "low" | "medium" | "high" | null
  notes: string | null
  calories: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
  fiber: number | null
  sugar: number | null
  sodium: number | null
  recipe: { id: string; slug: string; name: string } | null
  createdAt: string
}

function nutrient(value: number | null | undefined, key: NutrientKey) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    return null
  return roundNutrient(key, value)
}

function recipeOf(log: MealLog) {
  const ref = log.recipe as unknown as
    | { getEntity?: () => Recipe | null }
    | Recipe
    | null
    | undefined
  const recipe =
    ref && typeof (ref as { getEntity?: unknown }).getEntity === "function"
      ? (ref as { getEntity: () => Recipe | null }).getEntity()
      : (ref as Recipe | null | undefined)
  if (!recipe || !("id" in recipe)) return null
  return { id: recipe.id, slug: recipe.slug, name: recipe.name }
}

function toDto(log: MealLog): MealLogDto {
  return {
    id: log.id,
    name: log.name,
    serving: log.serving ?? null,
    servings: toNumber(log.servings),
    loggedAt: log.loggedAt.toISOString(),
    source: log.source as MealLogDto["source"],
    confidence: (log.confidence as MealLogDto["confidence"]) ?? null,
    notes: log.notes ?? null,
    calories: toNumber(log.calories),
    protein: toNumber(log.protein),
    carbs: toNumber(log.carbs),
    fat: toNumber(log.fat),
    fiber: toNumber(log.fiber),
    sugar: toNumber(log.sugar),
    sodium: toNumber(log.sodium),
    recipe: recipeOf(log),
    createdAt: log.createdAt.toISOString(),
  }
}

export async function listMealLogs(
  em: EntityManager,
  _householdId: string,
  options: { limit: number; offset: number }
) {
  const logs = await em.find(
    MealLog,
    {},
    {
      populate: ["recipe"],
      orderBy: { loggedAt: "desc", createdAt: "desc" },
      limit: options.limit,
      offset: options.offset,
    }
  )
  return { logs: logs.map(toDto) }
}

export async function createMealLog(
  em: EntityManager,
  options: {
    householdId: string
    userId: string | null
    input: MealLogInput
  }
) {
  let recipe: Recipe | undefined
  if (options.input.recipeId) {
    recipe =
      (await em.findOne(Recipe, { id: options.input.recipeId })) ?? undefined
    if (!recipe) {
      throw new AppError("not_found", "not_found", "No such recipe.")
    }
  }

  const log = em.create(MealLog, {
    household: options.householdId,
    user: options.userId,
    recipe,
    name: options.input.name,
    serving: options.input.serving ?? undefined,
    servings: options.input.servings ?? undefined,
    loggedAt: options.input.loggedAt
      ? new Date(options.input.loggedAt)
      : new Date(),
    source: options.input.source,
    confidence: options.input.confidence ?? undefined,
    notes: options.input.notes ?? undefined,
    calories: nutrient(options.input.calories, "calories"),
    protein: nutrient(options.input.protein, "protein"),
    carbs: nutrient(options.input.carbs, "carbs"),
    fat: nutrient(options.input.fat, "fat"),
    fiber: nutrient(options.input.fiber, "fiber"),
    sugar: nutrient(options.input.sugar, "sugar"),
    sodium: nutrient(options.input.sodium, "sodium"),
  })
  await em.flush()
  if (recipe) await em.populate(log, ["recipe"])
  return toDto(log)
}

export async function deleteMealLog(
  em: EntityManager,
  _householdId: string,
  logId: string
) {
  const log = await em.findOne(MealLog, { id: logId })
  if (!log) throw new AppError("not_found", "not_found", "No such meal log.")
  await em.remove(log).flush()
}
