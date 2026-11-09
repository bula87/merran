import { z } from "@hono/zod-openapi"
import {
  MEAL_LOG_CONFIDENCE,
  MEAL_LOG_SOURCES,
} from "../../database/entities/index.ts"

export const MealLogSourceSchema = z
  .enum(MEAL_LOG_SOURCES)
  .openapi("MealLogSource")
export const MealLogConfidenceSchema = z
  .enum(MEAL_LOG_CONFIDENCE)
  .openapi("MealLogConfidence")

export const MealLogSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    serving: z.string().nullable(),
    servings: z.number().nullable(),
    loggedAt: z.iso.datetime(),
    source: MealLogSourceSchema,
    confidence: MealLogConfidenceSchema.nullable(),
    notes: z.string().nullable(),
    calories: z.number().nullable(),
    protein: z.number().nullable(),
    carbs: z.number().nullable(),
    fat: z.number().nullable(),
    fiber: z.number().nullable(),
    sugar: z.number().nullable(),
    sodium: z.number().nullable(),
    recipe: z
      .object({
        id: z.string(),
        slug: z.string(),
        name: z.string(),
      })
      .nullable(),
    createdAt: z.iso.datetime(),
  })
  .openapi("MealLog", {
    example: {
      id: "meal-log-1",
      name: "Chicken salad",
      serving: "1 plate",
      servings: 1,
      loggedAt: "2026-11-09T12:30:00.000Z",
      source: "photo",
      confidence: "medium",
      notes: "Dressing amount uncertain.",
      calories: 420,
      protein: 34,
      carbs: 18,
      fat: 24,
      fiber: 4,
      sugar: 6,
      sodium: 680,
      recipe: null,
      createdAt: "2026-11-09T12:30:00.000Z",
    },
  })

export const MealLogListSchema = z
  .object({
    logs: z.array(MealLogSchema),
  })
  .openapi("MealLogList")

const nutrient = z.number().finite().min(0).max(100000).nullable().optional()

export const MealLogInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Give the meal a name.")
      .max(200, "Keep the name under 200 characters."),
    serving: z
      .string()
      .trim()
      .max(120, "Keep the serving under 120 characters.")
      .nullish()
      .transform((v) => v || null),
    servings: z
      .number()
      .positive("Use a number above 0.")
      .max(1000)
      .nullish()
      .transform((v) => v ?? null),
    loggedAt: z.iso.datetime().optional(),
    source: MealLogSourceSchema.default("manual"),
    confidence: MealLogConfidenceSchema.nullish().transform((v) => v ?? null),
    notes: z
      .string()
      .trim()
      .max(2000, "Keep notes under 2,000 characters.")
      .nullish()
      .transform((v) => v || null),
    calories: nutrient,
    protein: nutrient,
    carbs: nutrient,
    fat: nutrient,
    fiber: nutrient,
    sugar: nutrient,
    sodium: nutrient,
    recipeId: z
      .string()
      .trim()
      .min(1)
      .nullish()
      .transform((v) => v || null),
  })
  .openapi("MealLogInput")

export type MealLogInput = z.infer<typeof MealLogInputSchema>

export const MealLogParam = z.object({
  logId: z.string().openapi({ param: { name: "logId", in: "path" } }),
})

export const MealLogListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})
