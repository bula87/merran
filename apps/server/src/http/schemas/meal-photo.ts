import { z } from "@hono/zod-openapi"

export const MealPhotoAnalysisSchema = z
  .object({
    name: z.string().nullable(),
    description: z.string().nullable(),
    serving: z.string().nullable(),
    confidence: z.enum(["low", "medium", "high"]).nullable(),
    calories: z.number().optional(),
    protein: z.number().optional(),
    carbs: z.number().optional(),
    fat: z.number().optional(),
    fiber: z.number().optional(),
    sugar: z.number().optional(),
    sodium: z.number().optional(),
    notes: z.string().nullable(),
  })
  .openapi("MealPhotoAnalysis", {
    description:
      "Estimated nutrition for the meal shown in the photo. Values are per serving as shown; unknown values are left out.",
  })

export const MealPhotoJobSchema = z
  .object({
    jobId: z.string(),
    status: z.enum(["queued", "running", "done", "failed", "cancelled"]),
  })
  .openapi("MealPhotoJob")

export const MealPhotoJobStatusSchema = MealPhotoJobSchema.extend({
  analysis: MealPhotoAnalysisSchema.nullable().openapi({
    description: "The analysis, once the job is done.",
  }),
  error: z.string().nullable(),
}).openapi("MealPhotoJobStatus")
