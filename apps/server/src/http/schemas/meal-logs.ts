import { z } from "@hono/zod-openapi"
import {
  MEAL_LOG_CONFIDENCE,
  MEAL_LOG_SOURCES,
  MEAL_LOG_STATUSES,
} from "../../database/entities/index.ts"

export const MealLogSourceSchema = z
  .enum(MEAL_LOG_SOURCES)
  .openapi("MealLogSource")
export const MealLogConfidenceSchema = z
  .enum(MEAL_LOG_CONFIDENCE)
  .openapi("MealLogConfidence")
export const MealLogStatusSchema = z
  .enum(MEAL_LOG_STATUSES)
  .openapi("MealLogStatus")

export const MealLogSchema = z
  .object({
    id: z.string(),
    status: MealLogStatusSchema,
    name: z.string(),
    serving: z.string().nullable(),
    servings: z.number().nullable(),
    loggedAt: z.iso.datetime(),
    source: MealLogSourceSchema,
    confidence: MealLogConfidenceSchema.nullable(),
    notes: z.string().nullable(),
    inputText: z.string().nullable(),
    hasPhoto: z.boolean(),
    error: z.string().nullable(),
    calories: z.number().nullable(),
    protein: z.number().nullable(),
    carbs: z.number().nullable(),
    fat: z.number().nullable(),
    fiber: z.number().nullable(),
    sugar: z.number().nullable(),
    sodium: z.number().nullable(),
    recipe: z
      .object({ id: z.string(), slug: z.string(), name: z.string() })
      .nullable(),
    createdAt: z.iso.datetime(),
  })
  .openapi("MealLog")

export const MealLogListSchema = z
  .object({ logs: z.array(MealLogSchema) })
  .openapi("MealLogList")

const nutrient = z.number().finite().min(0).max(100000).nullable().optional()

export const MealLogInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    serving: z
      .string()
      .trim()
      .max(120)
      .nullish()
      .transform((v) => v || null),
    servings: z
      .number()
      .positive()
      .max(1000)
      .nullish()
      .transform((v) => v ?? null),
    loggedAt: z.iso.datetime().optional(),
    source: MealLogSourceSchema.default("manual"),
    confidence: MealLogConfidenceSchema.nullish().transform((v) => v ?? null),
    notes: z
      .string()
      .trim()
      .max(2000)
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

export const MealLogAnalyzeTextSchema = z
  .object({
    text: z.string().trim().min(1).max(4000),
  })
  .openapi("MealLogAnalyzeText")

export const MealLogApproveSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    serving: z
      .string()
      .trim()
      .max(120)
      .nullish()
      .transform((v) => (v === undefined ? undefined : v || null)),
    notes: z
      .string()
      .trim()
      .max(2000)
      .nullish()
      .transform((v) => (v === undefined ? undefined : v || null)),
    calories: nutrient,
    protein: nutrient,
    carbs: nutrient,
    fat: nutrient,
    fiber: nutrient,
    sugar: nutrient,
    sodium: nutrient,
  })
  .openapi("MealLogApprove")

export const MealLogParam = z.object({
  logId: z.string().openapi({ param: { name: "logId", in: "path" } }),
})

export const MealLogListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.string().optional(),
})
