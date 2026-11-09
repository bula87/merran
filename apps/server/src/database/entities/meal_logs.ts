import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { householdFilter } from "../scope.ts"
import { createdAt, id } from "./base.ts"
import { householdRef } from "./households.ts"
import { recipeRef } from "./recipes.ts"
import { User } from "./users.ts"

export const MEAL_LOG_SOURCES = ["photo", "text", "recipe", "manual"] as const
export type MealLogSource = (typeof MEAL_LOG_SOURCES)[number]

export const MEAL_LOG_CONFIDENCE = ["low", "medium", "high"] as const
export type MealLogConfidence = (typeof MEAL_LOG_CONFIDENCE)[number]

export const MEAL_LOG_STATUSES = [
  "processing",
  "ready",
  "failed",
  "logged",
] as const
export type MealLogStatus = (typeof MEAL_LOG_STATUSES)[number]

/** A meal log: analyzed drafts to review, and approved/logged meals. */
export const MealLog = defineEntity({
  name: "MealLog",
  tableName: "meal_logs",
  properties: {
    id: id(),
    household: () => householdRef(),
    user: () => p.manyToOne(User).ref().nullable().deleteRule("set null"),
    recipe: () => recipeRef().nullable(),
    status: p.enum(MEAL_LOG_STATUSES).default("logged").index(),
    name: p.string(),
    /** Portion as shown or eaten, for example "1 bowl" or "2 slices". */
    serving: p.string().nullable(),
    /** Number of servings, when known. */
    servings: p.double().nullable(),
    /** When the meal was eaten/logged. */
    loggedAt: p.datetime().onCreate(() => new Date()),
    source: p.enum(MEAL_LOG_SOURCES),
    confidence: p.enum(MEAL_LOG_CONFIDENCE).nullable(),
    notes: p.text().nullable(),
    /** Human text to analyze, for text-based review logs. */
    inputText: p.text().nullable(),
    /** Uploaded photo kept for review/analysis. */
    inputPhotoKey: p.string().nullable(),
    /** Why analysis failed. */
    error: p.text().nullable(),
    /** kcal */
    calories: p.double().nullable(),
    /** grams */
    protein: p.double().nullable(),
    carbs: p.double().nullable(),
    fat: p.double().nullable(),
    fiber: p.double().nullable(),
    sugar: p.double().nullable(),
    /** milligrams */
    sodium: p.double().nullable(),
    createdAt: createdAt(),
  },
  filters: householdFilter,
})

export type MealLog = InferEntity<typeof MealLog>
