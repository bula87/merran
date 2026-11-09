import {
  addDays,
  checkTastes,
  clockIn,
  dayOfWeek,
  fitsTheme,
  missingDiets,
  NO_TASTES,
  NO_THEMES,
  reasonsFor,
  themeLabel,
  WEEKNIGHTS,
  type Diet,
  type IngredientMark,
  type Meal,
  type NightTheme,
  type Reason,
} from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import {
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  generateText,
  Output,
} from "ai"
import { z } from "zod"

import { AppError } from "../../core/errors.ts"
import { toNumber } from "../../database/numbers.ts"
import {
  Household,
  PlanEntry,
  Recipe,
  RecipeIngredient,
} from "../../database/entities/index.ts"
import type { UserProfile } from "../../http/schemas/user-profile.ts"
import { decodeDiets } from "../recipes/diet-labels.ts"
import { photoUrls } from "../recipes/photos/photos.ts"
import { totalMinutes } from "../recipes/recipes.ts"
import { tagKey, tagsOf } from "../recipes/tags.ts"
import { resolveTask } from "../ai/status.ts"
import { useAi, type AiDeps } from "../ai/run.ts"
import type { Slot, Suggestion } from "./suggest.ts"

const NO_REPEAT_DAYS = 14

const MEAL_TAGS: Record<Meal, string[]> = {
  breakfast: ["breakfast", "brunch"],
  "morning-snack": ["snack", "breakfast", "brunch", "smoothie", "fruit"],
  lunch: ["lunch", "salad", "sandwich", "soup"],
  "afternoon-snack": ["snack", "appetizer", "dessert", "smoothie", "fruit"],
  dinner: ["dinner", "main", "main course", "main dish", "entree", "supper"],
}

const PART_TAGS = [
  "sauce",
  "sauces",
  "dressing",
  "dressings",
  "condiment",
  "condiments",
  "marinade",
  "seasoning",
  "spice blend",
  "spice mix",
  "glaze",
  "frosting",
  "topping",
]

type Candidate = {
  id: string
  slug: string
  name: string
  photo: string | null
  servings: number | null
  totalMinutes: number | null
  rating: number | null
  lastMadeAt: Date | null
  tags: string[]
  diets: Diet[]
  lines: string[]
  marks: (IngredientMark | null)[]
  needs: string[]
  calories: number | null
  nutrition: {
    calories: number | null
    protein: number | null
    carbs: number | null
    fat: number | null
    fiber: number | null
    sugar: number | null
    sodium: number | null
  } | null
}

function fitsMeal(recipe: Candidate, meal: Meal) {
  if (MEAL_TAGS[meal].some((tag) => recipe.tags.includes(tag))) return true
  if (meal !== "dinner") return false
  const other = [
    ...MEAL_TAGS.breakfast,
    ...MEAL_TAGS["morning-snack"],
    ...MEAL_TAGS["afternoon-snack"],
    "drink",
    "cocktail",
    "beverage",
  ]
  return !other.some((tag) => recipe.tags.includes(tag))
}

const isWeeknightDinner = (slot: Slot) =>
  slot.meal === "dinner" && WEEKNIGHTS.includes(dayOfWeek(slot.date))

const dish = (name: string) =>
  name
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim()
    .toLowerCase()

async function candidates(em: EntityManager): Promise<Candidate[]> {
  const recipes = await em.find(Recipe, {})
  const ids = recipes.map((recipe) => recipe.id)
  const tags = await tagsOf(em, ids)
  const lines = new Map<string, RecipeIngredient[]>()
  if (ids.length > 0) {
    for (const line of await em.find(
      RecipeIngredient,
      { recipe: { $in: ids } },
      { orderBy: { position: "asc" } }
    )) {
      const list = lines.get(line.recipe.id)
      if (list) list.push(line)
      else lines.set(line.recipe.id, [line])
    }
  }
  return recipes.map((recipe) => {
    const nutrition = recipe.nutrition
    return {
      id: recipe.id,
      slug: recipe.slug,
      name: recipe.name,
      photo: photoUrls(recipe)?.card ?? null,
      servings: toNumber(recipe.servings),
      totalMinutes: totalMinutes(recipe),
      rating: toNumber(recipe.rating),
      lastMadeAt: recipe.lastMadeAt ?? null,
      tags: (tags.get(recipe.id) ?? []).map(tagKey),
      diets: decodeDiets(recipe.diets),
      lines: (lines.get(recipe.id) ?? []).map((line) => line.rawText),
      marks: (lines.get(recipe.id) ?? []).map((line) => line.mark ?? null),
      needs: recipe.needs ?? [],
      calories: nutrition?.calories ?? null,
      nutrition: nutrition
        ? {
            calories: nutrition.calories ?? null,
            protein: nutrition.protein ?? null,
            carbs: nutrition.carbs ?? null,
            fat: nutrition.fat ?? null,
            fiber: nutrition.fiber ?? null,
            sugar: nutrition.sugar ?? null,
            sodium: nutrition.sodium ?? null,
          }
        : null,
    }
  })
}

const AiPick = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  meal: z.enum([
    "breakfast",
    "morning-snack",
    "lunch",
    "afternoon-snack",
    "dinner",
  ]),
  recipeId: z.string().min(1),
})

const AiPlan = z.object({
  suggestions: z.array(AiPick).max(56),
})

export type AiSuggestStatus = "requesting_large_model" | "fallback_small_model"

const LARGE_MODEL_TIMEOUT_MS = 6 * 60 * 1000
const SMALL_MODEL_TIMEOUT_MS = 3 * 60 * 1000

function isTimeoutError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === "TimeoutError") ||
    (error instanceof Error && error.name === "TimeoutError")
  )
}

export async function aiSuggestMeals(
  deps: AiDeps,
  em: EntityManager,
  options: {
    householdId: string
    userId: string | null
    slots: readonly Slot[]
    exclude?: readonly string[]
    profile: UserProfile
    /** Maximum calories per day (guidance). */
    maxCaloriesPerDay?: number
    /** Progress updates for long-running AI requests (e.g. model fallback). */
    onStatus?: (status: AiSuggestStatus) => void | Promise<void>
    /** Cancel in-flight AI work, e.g. when a background job is stopped. */
    signal?: AbortSignal
  }
): Promise<Suggestion[]> {
  if (options.slots.length === 0) return []
  const maxCaloriesPerDay = options.maxCaloriesPerDay ?? 2000
  const profile = options.profile

  const household = await em.findOneOrFail(Household, {
    id: options.householdId,
  })
  const tastes = { ...NO_TASTES, ...household.settings?.tastes }
  const themes = household.settings?.themes ?? NO_THEMES
  const { today } = clockIn(household.timeZone)

  const recipes = await candidates(em)
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]))

  const dates = options.slots.map((slot) => slot.date).sort()
  const nearby = await em.find(PlanEntry, {
    date: {
      $gte: addDays(dates[0]!, -NO_REPEAT_DAYS),
      $lte: addDays(dates.at(-1)!, NO_REPEAT_DAYS),
    },
    status: { $ne: "skipped" },
  })
  const used = new Set<string>(
    [
      ...(options.exclude ?? []),
      ...nearby.flatMap((entry) => (entry.recipe ? [entry.recipe.id] : [])),
    ]
      .map((id) => byId.get(id))
      .filter((recipe) => recipe !== undefined)
      .map((recipe) => dish(recipe.name))
  )
  const madeLately = new Date(
    new Date(`${today}T00:00:00Z`).getTime() - NO_REPEAT_DAYS * 86_400_000
  )

  const checks = new Map(
    recipes.map((recipe) => [recipe.id, checkTastes(recipe, tastes.avoid)])
  )
  const ruledOut = new Set(
    recipes
      .filter(
        (recipe) =>
          missingDiets(recipe.diets, tastes.diets).length > 0 ||
          (checks.get(recipe.id)?.ruledOut.length ?? 0) > 0
      )
      .map((recipe) => recipe.id)
  )
  const isPart = (recipe: Candidate) =>
    recipe.tags.some((tag) => PART_TAGS.includes(tag))
  const tooLong = (recipe: Candidate, slot: Slot) =>
    tastes.weeknightMinutes !== null &&
    isWeeknightDinner(slot) &&
    recipe.totalMinutes !== null &&
    recipe.totalMinutes > tastes.weeknightMinutes
  const themeOf = (slot: Slot): NightTheme | null =>
    slot.meal === "dinner" ? (themes[dayOfWeek(slot.date)] ?? null) : null

  function allowedFor(slot: Slot) {
    const theme = themeOf(slot)
    return recipes.filter((recipe) => {
      if (ruledOut.has(recipe.id) || isPart(recipe)) return false
      if (used.has(dish(recipe.name))) return false
      if (recipe.lastMadeAt && recipe.lastMadeAt > madeLately) return false
      if (!fitsMeal(recipe, slot.meal)) return false
      if (tooLong(recipe, slot)) return false
      if (theme?.kind === "skip") return false
      // Theme fit is a preference for AI; hard-skip only for "skip" nights.
      return true
    })
  }

  const allowedBySlot = new Map(
    options.slots.map((slot) => [`${slot.date}:${slot.meal}`, allowedFor(slot)])
  )
  // Compact pool for the prompt: union of allowed candidates, capped.
  const poolIds = new Set<string>()
  for (const list of allowedBySlot.values())
    for (const r of list) poolIds.add(r.id)
  const pool = recipes
    .filter((r) => poolIds.has(r.id))
    .sort(
      (a, b) =>
        (b.rating ?? 0) - (a.rating ?? 0) || a.name.localeCompare(b.name)
    )
    .slice(0, 140)
    .map((r) => ({
      id: r.id,
      n: r.name,
      cal: r.calories,
      p: r.nutrition?.protein ?? null,
      c: r.nutrition?.carbs ?? null,
      f: r.nutrition?.fat ?? null,
      tags: r.tags.slice(0, 6),
      min: r.totalMinutes,
    }))
  const poolSet = new Set(pool.map((r) => r.id))

  const slotPayload = options.slots.map((slot) => ({
    date: slot.date,
    meal: slot.meal,
    day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
      dayOfWeek(slot.date)
    ],
    theme:
      themeOf(slot) && themeOf(slot)!.kind !== "skip"
        ? themeLabel(themeOf(slot)!)
        : themeOf(slot)?.kind === "skip"
          ? "skip"
          : null,
    allowed: (allowedBySlot.get(`${slot.date}:${slot.meal}`) ?? [])
      .filter((r) => poolSet.has(r.id))
      .map((r) => r.id)
      .slice(0, 50),
  }))

  const system = `Plan weekly meals. Pick one recipeId per slot from that slot's "allowed" IDs (must exist in recipes). Respect allergies, diets, dislikes, theme nights. Prefer liked foods and goal. Aim for ~${maxCaloriesPerDay} kcal/day when calories (cal) are known. Do not repeat recipes. Return only JSON matching the schema: {"suggestions":[{"date":"YYYY-MM-DD","meal":"breakfast|morning-snack|lunch|afternoon-snack|dinner","recipeId":"..."}]}.`

  const prompt = JSON.stringify({
    maxCaloriesPerDay,
    userProfile: {
      goal: profile.goal,
      allergies: profile.allergies,
      favoriteFoods: profile.favoriteFoods,
      dislikedFoods: profile.dislikedFoods,
      mealsPerDay: profile.mealsPerDay,
      cookingDevices: profile.cookingDevices,
    },
    household: {
      diets: tastes.diets,
      weeknightMaxMin: tastes.weeknightMinutes,
    },
    slots: slotPayload,
    recipes: pool,
  })

  async function run(modelRef: string | undefined, timeoutMs: number) {
    const timeout = AbortSignal.timeout(timeoutMs)
    const signal = options.signal
      ? AbortSignal.any([timeout, options.signal])
      : timeout
    const r = await useAi(
      deps,
      em,
      {
        householdId: options.householdId,
        userId: options.userId,
        task: "plan",
        needs: ["structured"],
        modelRef,
        aiLog: {
          input: { slotCount: options.slots.length, poolSize: pool.length },
        },
      },
      (model) =>
        generateText({
          model,
          system,
          prompt,
          output: Output.object({
            schema: AiPlan,
            name: "meal_plan_suggestions",
          }),
          maxOutputTokens: 8000,
          temperature: 0,
          abortSignal: signal,
        })
    )
    return r.output
  }

  function shouldFallback(error: unknown) {
    if (!(error instanceof AppError)) return true
    return ![
      "ai_noKey",
      "ai_notCovered",
      "ai_overLimit",
      "ai_ownLimit",
    ].includes(error.code)
  }

  function friendlyError(error: unknown): never {
    if (error instanceof AppError) throw error
    if (
      NoOutputGeneratedError.isInstance(error) ||
      NoObjectGeneratedError.isInstance(error)
    ) {
      throw new AppError(
        "upstream",
        "ai_answer_unreadable",
        "The AI's answer couldn't be read. Try again, or pick another model in Settings, Household, AI."
      )
    }
    throw error
  }

  let output: z.infer<typeof AiPlan>
  const onStatus = options.onStatus
  try {
    if (options.signal?.aborted)
      throw options.signal.reason ?? new Error("Aborted")
    await onStatus?.("requesting_large_model")
    output = await run(undefined, LARGE_MODEL_TIMEOUT_MS)
  } catch (error) {
    if (options.signal?.aborted) throw error
    if (!shouldFallback(error)) throw error
    deps.logger?.warn(
      {
        err: error,
        task: "plan",
        timeout: isTimeoutError(error),
        model: "large",
      },
      isTimeoutError(error)
        ? "AI plan timed out, trying small model"
        : "AI plan failed, trying small model"
    )
    await onStatus?.("fallback_small_model")
    try {
      if (options.signal?.aborted)
        throw options.signal.reason ?? new Error("Aborted")
      const small = await resolveTask(deps, em, options.householdId, "swaps", 0)
      if (small.ok) {
        output = await run(small.ref, SMALL_MODEL_TIMEOUT_MS)
      } else {
        friendlyError(error)
      }
    } catch (fallbackError) {
      if (options.signal?.aborted) throw fallbackError
      if (isTimeoutError(error) && isTimeoutError(fallbackError)) {
        throw new AppError(
          "upstream",
          "ai_timeout",
          "The AI took too long to fill the week. Try again, or fill fewer meals."
        )
      }
      if (isTimeoutError(fallbackError)) {
        throw new AppError(
          "upstream",
          "ai_timeout",
          "The AI took too long to fill the week. Try again, or fill fewer meals."
        )
      }
      if (shouldFallback(fallbackError) && fallbackError !== error) {
        deps.logger?.warn(
          { err: fallbackError, task: "plan" },
          "AI plan fallback failed"
        )
      }
      friendlyError(fallbackError)
    }
  }

  const chosenBySlot = new Map<string, string>()
  const chosenDishes = new Set<string>()
  for (const pick of output.suggestions) {
    const key = `${pick.date}:${pick.meal}`
    if (chosenBySlot.has(key)) continue
    const allowed = allowedBySlot.get(key)
    if (!allowed) continue
    const recipe = byId.get(pick.recipeId)
    if (!recipe) continue
    if (!allowed.some((r) => r.id === recipe.id)) continue
    const d = dish(recipe.name)
    if (used.has(d) || chosenDishes.has(d)) continue
    chosenBySlot.set(key, recipe.id)
    chosenDishes.add(d)
  }

  return options.slots.flatMap((slot) => {
    const recipeId = chosenBySlot.get(`${slot.date}:${slot.meal}`)
    const recipe = recipeId ? byId.get(recipeId) : null
    if (!recipe) return []
    const theme = themeOf(slot)
    const why: Reason[] = reasonsFor(recipe, {
      today,
      theme: theme
        ? { label: themeLabel(theme), fits: fitsTheme(recipe, theme) }
        : null,
      weeknightDinner: isWeeknightDinner(slot),
      usesUp: [],
      onSale: null,
      leaveOut: checks.get(recipe.id)?.leaveOut ?? [],
    })
    return [
      {
        ...slot,
        recipe: {
          id: recipe.id,
          slug: recipe.slug,
          name: recipe.name,
          photo: recipe.photo,
          servings: recipe.servings,
          totalMinutes: recipe.totalMinutes,
        },
        withRecipe: null,
        why,
      } satisfies Suggestion,
    ]
  })
}
