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
import { generateText, Output } from "ai"
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
import { getPolicy } from "../ai/policy.ts"
import { householdAi } from "../ai/status.ts"
import { decodeDiets } from "../recipes/diet-labels.ts"
import { photoUrls } from "../recipes/photos/photos.ts"
import { totalMinutes } from "../recipes/recipes.ts"
import { tagKey, tagsOf } from "../recipes/tags.ts"
import { useAi, type AiDeps } from "../ai/run.ts"
import type { Slot, Suggestion } from "./suggest.ts"

const NO_REPEAT_DAYS = 14

const MEAL_TAGS: Record<Meal, string[]> = {
  breakfast: ["breakfast", "brunch"],
  lunch: ["lunch", "salad", "sandwich", "soup"],
  dinner: ["dinner", "main", "main course", "main dish", "entree", "supper"],
  snack: ["snack", "appetizer", "dessert"],
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
    ...MEAL_TAGS.snack,
    "drink",
    "cocktail",
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
  meal: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  recipeId: z.string().min(1),
})

const AiPlan = z.object({
  suggestions: z.array(AiPick).max(56),
})

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
    .slice(0, 350)
    .map((r) => ({
      id: r.id,
      name: r.name,
      calories: r.calories,
      nutrition: r.nutrition,
      tags: r.tags.slice(0, 8),
      totalMinutes: r.totalMinutes,
      servings: r.servings,
      diets: r.diets,
    }))
  const poolSet = new Set(pool.map((r) => r.id))

  const slotPayload = options.slots.map((slot) => ({
    date: slot.date,
    meal: slot.meal,
    weekday: [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ][dayOfWeek(slot.date)],
    theme:
      themeOf(slot) && themeOf(slot)!.kind !== "skip"
        ? themeLabel(themeOf(slot)!)
        : themeOf(slot)?.kind === "skip"
          ? "skip/eat out"
          : null,
    allowedRecipeIds: (allowedBySlot.get(`${slot.date}:${slot.meal}`) ?? [])
      .filter((r) => poolSet.has(r.id))
      .map((r) => r.id)
      .slice(0, 120),
  }))

  const system = `You plan weekly meals for a household. Choose recipes only from the provided recipe pool and only recipe IDs listed as allowed for each slot. Respect allergies, dietary needs, dislikes, theme nights, and practical constraints. Prefer liked foods and the user's goal when reasonable. Aim for about ${maxCaloriesPerDay} kcal per day across that day's planned meals when calorie data is available (it is an estimate). Do not repeat the same recipe unless unavoidable. Return structured JSON only.`

  const prompt = JSON.stringify(
    {
      maxCaloriesPerDay,
      today,
      userProfile: {
        age: profile.age,
        weightKg: profile.weightKg,
        heightCm: profile.heightCm,
        goal: profile.goal,
        mealsPerDay: profile.mealsPerDay,
        cookingDevices: profile.cookingDevices,
        allergies: profile.allergies,
        favoriteFoods: profile.favoriteFoods,
        dislikedFoods: profile.dislikedFoods,
      },
      household: {
        diets: tastes.diets,
        weeknightDinnerMaxMinutes: tastes.weeknightMinutes,
      },
      slots: slotPayload,
      recipes: pool,
    },
    null,
    2
  )

  async function run(modelRef?: string) {
    return useAi(
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
          maxOutputTokens: 4000,
        })
    )
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

  let result
  try {
    result = await run()
  } catch (error) {
    if (!shouldFallback(error)) throw error
    const [ai, policy] = await Promise.all([
      householdAi(em, options.householdId),
      getPolicy(deps.settings),
    ])
    const smallRef = ai.small ?? policy.small ?? null
    if (!smallRef) throw error
    deps.logger?.warn(
      { err: error, task: "plan", fallback: "small" },
      "AI plan falling back to small model"
    )
    result = await run(smallRef)
  }
  const { output } = result

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
