import { z } from "@hono/zod-openapi"
import { SUPPORTED_LOCALES } from "@merran/shared"

export const TranslatedIngredientSchema = z
  .object({
    section: z.string().nullable(),
    text: z.string(),
    note: z.string().nullable(),
  })
  .openapi("TranslatedRecipeIngredient")

export const TranslatedStepSchema = z
  .object({
    section: z.string().nullable(),
    text: z.string(),
  })
  .openapi("TranslatedRecipeStep")

export const RecipeTranslationSchema = z
  .object({
    locale: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    yieldText: z.string().nullable(),
    notes: z.string().nullable(),
    ingredients: z.array(TranslatedIngredientSchema),
    steps: z.array(TranslatedStepSchema),
    translatedAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("RecipeTranslation", {
    example: {
      locale: "pl",
      name: "Zupa z dyni",
      description: null,
      yieldText: null,
      notes: null,
      ingredients: [{ section: null, text: "1 dynia", note: null }],
      steps: [{ section: null, text: "Upiecz dynię." }],
      translatedAt: "2026-11-09T00:00:00.000Z",
      updatedAt: "2026-11-09T00:00:00.000Z",
    },
  })

export const RecipeTranslationsStatusSchema = z
  .object({
    supportedLocales: z.array(z.string()).openapi({
      example: [...SUPPORTED_LOCALES],
    }),
    locales: z.array(z.string()).openapi({
      description: "Locales this recipe has translations for.",
    }),
    complete: z.boolean(),
    translations: z.array(RecipeTranslationSchema),
  })
  .openapi("RecipeTranslationsStatus")
