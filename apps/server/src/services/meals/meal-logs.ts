import { roundNutrient, type NutrientKey } from "@merran/shared"
import type { EntityManager, FilterQuery } from "@mikro-orm/sql"
import { AppError } from "../../core/errors.ts"
import { toNumber } from "../../database/numbers.ts"
import { MealLog, Recipe } from "../../database/entities/index.ts"

export type MealLogDto = {
  id: string
  status: "processing" | "ready" | "failed" | "logged"
  name: string
  serving: string | null
  servings: number | null
  loggedAt: string
  source: "photo" | "text" | "recipe" | "manual"
  confidence: "low" | "medium" | "high" | null
  notes: string | null
  inputText: string | null
  hasPhoto: boolean
  error: string | null
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

export type MealLogInput = {
  name: string
  serving?: string | null
  servings?: number | null
  loggedAt?: string
  source?: "photo" | "text" | "recipe" | "manual"
  confidence?: "low" | "medium" | "high" | null
  notes?: string | null
  calories?: number | null
  protein?: number | null
  carbs?: number | null
  fat?: number | null
  fiber?: number | null
  sugar?: number | null
  sodium?: number | null
  recipeId?: string | null
}

export type MealLogApproveInput = {
  name?: string
  serving?: string | null
  notes?: string | null
  calories?: number | null
  protein?: number | null
  carbs?: number | null
  fat?: number | null
  fiber?: number | null
  sugar?: number | null
  sodium?: number | null
}

function nutrient(value: number | null | undefined, key: NutrientKey) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    return null
  return roundNutrient(key, value)
}

function recipeOf(log: MealLog) {
  const ref = log.recipe as unknown as
    { getEntity?: () => Recipe | null } | Recipe | null | undefined
  const recipe =
    ref && typeof (ref as { getEntity?: unknown }).getEntity === "function"
      ? (ref as { getEntity: () => Recipe | null }).getEntity()
      : (ref as Recipe | null | undefined)
  if (!recipe || !("id" in recipe)) return null
  return { id: recipe.id, slug: recipe.slug, name: recipe.name }
}

export function toMealLogDto(log: MealLog): MealLogDto {
  return {
    id: log.id,
    status: log.status as MealLogDto["status"],
    name: log.name,
    serving: log.serving ?? null,
    servings: toNumber(log.servings),
    loggedAt: log.loggedAt.toISOString(),
    source: log.source as MealLogDto["source"],
    confidence: (log.confidence as MealLogDto["confidence"]) ?? null,
    notes: log.notes ?? null,
    inputText: log.inputText ?? null,
    hasPhoto: !!log.inputPhotoKey,
    error: log.error ?? null,
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
  options: { limit: number; offset: number; status?: string }
) {
  const where: FilterQuery<MealLog> =
    options.status && options.status !== "all"
      ? options.status === "review"
        ? { status: { $in: ["processing", "ready", "failed"] } }
        : { status: options.status as MealLog["status"] }
      : {}
  const logs = await em.find(MealLog, where, {
    populate: ["recipe"],
    orderBy: { createdAt: "desc" },
    limit: options.limit,
    offset: options.offset,
  })
  return { logs: logs.map(toMealLogDto) }
}

export async function getMealLog(em: EntityManager, logId: string) {
  const log = await em.findOne(MealLog, { id: logId }, { populate: ["recipe"] })
  if (!log) throw new AppError("not_found", "not_found", "No such meal log.")
  return log
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
    status: "logged",
    name: options.input.name,
    serving: options.input.serving ?? undefined,
    servings: options.input.servings ?? undefined,
    loggedAt: options.input.loggedAt
      ? new Date(options.input.loggedAt)
      : new Date(),
    source: options.input.source ?? "manual",
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
  return toMealLogDto(log)
}

export async function createMealLogForAnalysis(
  em: EntityManager,
  options: {
    householdId: string
    userId: string | null
    source: "photo" | "text"
    name: string
    inputText?: string | null
    inputPhotoKey?: string | null
  }
) {
  const log = em.create(MealLog, {
    household: options.householdId,
    user: options.userId,
    status: "processing",
    name: options.name,
    source: options.source,
    inputText: options.inputText ?? undefined,
    inputPhotoKey: options.inputPhotoKey ?? undefined,
    loggedAt: new Date(),
  })
  await em.flush()
  return log
}

export async function applyMealLogAnalysis(
  em: EntityManager,
  logId: string,
  analysis: {
    name?: string | null
    description?: string | null
    serving?: string | null
    confidence?: "low" | "medium" | "high" | null
    notes?: string | null
    calories?: number
    protein?: number
    carbs?: number
    fat?: number
    fiber?: number
    sugar?: number
    sodium?: number
  }
) {
  const log = await em.findOne(MealLog, { id: logId })
  if (!log) return null
  log.status = "ready"
  log.error = undefined
  if (analysis.name?.trim()) log.name = analysis.name.trim()
  if (analysis.serving !== undefined)
    log.serving = analysis.serving ?? undefined
  if (analysis.confidence !== undefined)
    log.confidence = analysis.confidence ?? undefined
  const noteParts = [
    analysis.description?.trim(),
    analysis.notes?.trim(),
  ].filter(Boolean)
  if (noteParts.length) log.notes = noteParts.join("\n")
  log.calories = nutrient(analysis.calories, "calories") ?? undefined
  log.protein = nutrient(analysis.protein, "protein") ?? undefined
  log.carbs = nutrient(analysis.carbs, "carbs") ?? undefined
  log.fat = nutrient(analysis.fat, "fat") ?? undefined
  log.fiber = nutrient(analysis.fiber, "fiber") ?? undefined
  log.sugar = nutrient(analysis.sugar, "sugar") ?? undefined
  log.sodium = nutrient(analysis.sodium, "sodium") ?? undefined
  await em.flush()
  return log
}

export async function failMealLogAnalysis(
  em: EntityManager,
  logId: string,
  error: string
) {
  const log = await em.findOne(MealLog, { id: logId })
  if (!log) return null
  log.status = "failed"
  log.error = error
  await em.flush()
  return log
}

export async function approveMealLog(
  em: EntityManager,
  logId: string,
  input: MealLogApproveInput,
  deps?: { files?: { remove(key: string): Promise<void> } }
) {
  const log = await getMealLog(em, logId)
  if (log.status === "logged") {
    throw new AppError(
      "conflict",
      "meal_log_approved",
      "That meal log is already approved."
    )
  }
  if (input.name?.trim()) log.name = input.name.trim()
  if (input.serving !== undefined) log.serving = input.serving ?? undefined
  if (input.notes !== undefined) log.notes = input.notes ?? undefined
  if (input.calories !== undefined)
    log.calories = nutrient(input.calories, "calories") ?? undefined
  if (input.protein !== undefined)
    log.protein = nutrient(input.protein, "protein") ?? undefined
  if (input.carbs !== undefined)
    log.carbs = nutrient(input.carbs, "carbs") ?? undefined
  if (input.fat !== undefined) log.fat = nutrient(input.fat, "fat") ?? undefined
  if (input.fiber !== undefined)
    log.fiber = nutrient(input.fiber, "fiber") ?? undefined
  if (input.sugar !== undefined)
    log.sugar = nutrient(input.sugar, "sugar") ?? undefined
  if (input.sodium !== undefined)
    log.sodium = nutrient(input.sodium, "sodium") ?? undefined
  log.status = "logged"
  log.loggedAt = new Date()
  log.error = undefined
  const photoKey = log.inputPhotoKey ?? null
  log.inputPhotoKey = undefined
  await em.flush()
  if (photoKey && deps?.files) await deps.files.remove(photoKey).catch(() => {})
  return toMealLogDto(log)
}

export async function deleteMealLog(
  em: EntityManager,
  logId: string,
  deps?: { files?: { remove(key: string): Promise<void> } }
) {
  const log = await em.findOne(MealLog, { id: logId })
  if (!log) throw new AppError("not_found", "not_found", "No such meal log.")
  const photoKey = log.inputPhotoKey ?? null
  await em.remove(log).flush()
  if (photoKey && deps?.files) await deps.files.remove(photoKey).catch(() => {})
}
