import {
  joinSections,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { generateText, Output } from "ai"
import { z } from "zod"
import {
  Recipe,
  RecipeTranslation,
  type TranslatedIngredient,
  type TranslatedStep,
} from "../../../database/entities/index.ts"
import { ACROSS_HOUSEHOLDS } from "../../../database/scope.ts"
import { inHouseholdTransaction } from "../../../database/transactions.ts"
import { useAi, type AiDeps } from "../../ai/run.ts"
import { findRecipe, snapshotOf, updateRecipe } from "../recipes.ts"
import { tagsOf } from "../tags.ts"

const TranslatedIngredientSchema = z.object({
  section: z.string().nullable(),
  text: z.string(),
  note: z.string().nullable(),
})

const TranslatedStepSchema = z.object({
  section: z.string().nullable(),
  text: z.string(),
})

const OneTranslationSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  yieldText: z.string().nullable(),
  notes: z.string().nullable(),
  ingredients: z.array(TranslatedIngredientSchema),
  steps: z.array(TranslatedStepSchema),
})

const DetectSchema = z.object({
  locale: z
    .string()
    .describe(
      "BCP-47 language code of the recipe's main language, like en or pl."
    ),
})

function localeName(locale: SupportedLocale) {
  return locale === "pl" ? "Polish (pl)" : "English (en)"
}

function recipeText(recipe: Recipe) {
  const ingredients = recipe.ingredients.getItems().map((line, index) => ({
    index,
    section: line.section ?? null,
    text: line.rawText,
    note: line.note ?? null,
  }))
  const steps = recipe.steps.getItems().map((step, index) => ({
    index,
    section: step.section ?? null,
    text: step.text,
  }))
  return {
    name: recipe.name,
    description: recipe.description ?? null,
    yieldText: recipe.yieldText ?? null,
    notes: recipe.notes ?? null,
    ingredients,
    steps,
  }
}

type TranslationContent = {
  name: string
  description: string | null
  yieldText: string | null
  notes: string | null
  ingredients: TranslatedIngredient[]
  steps: TranslatedStep[]
}

function sourceAsTranslation(
  source: ReturnType<typeof recipeText>
): TranslationContent {
  return {
    name: source.name,
    description: source.description,
    yieldText: source.yieldText,
    notes: source.notes,
    ingredients: source.ingredients.map((line) => ({
      section: line.section,
      text: line.text,
      note: line.note,
    })),
    steps: source.steps.map((step) => ({
      section: step.section,
      text: step.text,
    })),
  }
}

function asRecipeInput(
  recipe: Recipe,
  tags: string[],
  content: TranslationContent
) {
  return {
    ...snapshotOf(recipe, tags),
    name: content.name,
    description: content.description,
    yieldText: content.yieldText,
    notes: content.notes,
    ingredients: joinSections(
      content.ingredients.map((line) => ({
        section: line.section,
        text: line.text,
      }))
    ),
    steps: joinSections(
      content.steps.map((step) => ({ section: step.section, text: step.text }))
    ),
  }
}

async function translateOne(
  deps: AiDeps,
  em: EntityManager,
  options: { householdId: string; userId: string | null },
  source: ReturnType<typeof recipeText>,
  locale: SupportedLocale
) {
  const { output } = await useAi(
    deps,
    em,
    {
      householdId: options.householdId,
      userId: options.userId,
      task: "translate",
      needs: ["structured"],
    },
    (model) =>
      generateText({
        model,
        output: Output.object({
          schema: OneTranslationSchema,
          name: "translation",
        }),
        system: `You translate recipes. Translate the recipe content into ${localeName(locale)}. Keep the meaning, quantities, units, food names, and cooking intent accurate and natural. Preserve the same ingredient and step order and count as the source. Keep section names translated consistently. Use null for fields that are null in the source.`,
        prompt: `Translate this recipe into ${localeName(locale)}.

Return:
- name, description, yieldText, notes
- ingredients: array with the same length and order as the source (${source.ingredients.length} items), each {section,text,note}
- steps: array with the same length and order as the source (${source.steps.length} items), each {section,text}

Source recipe:
${JSON.stringify(source, null, 2)}`,
      })
  )
  return {
    name: output.name,
    description: output.description,
    yieldText: output.yieldText,
    notes: output.notes,
    ingredients: alignIngredients(source.ingredients, output.ingredients),
    steps: alignSteps(source.steps, output.steps),
  }
}

async function upsertTranslation(
  em: EntityManager,
  options: {
    householdId: string
    recipeId: string
    locale: SupportedLocale
    translation: TranslationContent
    translatedAt: Date
  }
) {
  const existing = await em.findOne(RecipeTranslation, {
    recipe: options.recipeId,
    locale: options.locale,
  })
  if (existing) {
    existing.name = options.translation.name
    existing.description = options.translation.description
    existing.yieldText = options.translation.yieldText
    existing.notes = options.translation.notes
    existing.ingredients = options.translation.ingredients
    existing.steps = options.translation.steps
    existing.translatedAt = options.translatedAt
  } else {
    em.create(RecipeTranslation, {
      household: options.householdId,
      recipe: options.recipeId,
      locale: options.locale,
      name: options.translation.name,
      description: options.translation.description,
      yieldText: options.translation.yieldText,
      notes: options.translation.notes,
      ingredients: options.translation.ingredients,
      steps: options.translation.steps,
      translatedAt: options.translatedAt,
    })
  }
}

/**
 * Detects the recipe's language. English is the app's main language, so when
 * the original is in another language, the recipe is updated to its English
 * translation and the original content is stored as that language's
 * translation (when supported). All supported locales are then stored one by
 * one.
 */
export async function translateRecipe(
  deps: AiDeps,
  em: EntityManager,
  options: { householdId: string; userId: string | null; recipe: string }
) {
  let recipe = await findRecipe(em, options.recipe)
  const source = recipeText(recipe)
  const detectedCode = await (async () => {
    const { output } = await useAi(
      deps,
      em,
      {
        householdId: options.householdId,
        userId: options.userId,
        task: "translate",
        needs: ["structured"],
      },
      (model) =>
        generateText({
          model,
          output: Output.object({ schema: DetectSchema, name: "language" }),
          system:
            "You detect the main language of recipe text. Return only the language code.",
          prompt: `Detect the main language of this recipe. Return its BCP-47 code (for example en, pl, de, fr, es).

Recipe:
${JSON.stringify(
  {
    name: source.name,
    description: source.description,
    ingredients: source.ingredients.slice(0, 6).map((line) => line.text),
    steps: source.steps.slice(0, 3).map((step) => step.text),
  },
  null,
  2
)}`,
        })
    )
    return output.locale.trim().toLowerCase().split("-")[0] ?? ""
  })()

  const detected = SUPPORTED_LOCALES.includes(detectedCode as SupportedLocale)
    ? (detectedCode as SupportedLocale)
    : null
  const original = sourceAsTranslation(source)

  let english: TranslationContent
  if (detectedCode === "en") {
    english = original
  } else {
    english = await translateOne(deps, em, options, source, "en")
  }

  if (detectedCode !== "en") {
    const tags = (await tagsOf(em, [recipe.id])).get(recipe.id) ?? []
    await updateRecipe(em, {
      householdId: options.householdId,
      userId: options.userId,
      recipe: recipe.id,
      input: asRecipeInput(recipe, tags, english),
      source: "assistant",
    })
    recipe = await findRecipe(em.fork(), recipe.id)
  }

  for (const locale of SUPPORTED_LOCALES) {
    const translation =
      locale === "en"
        ? english
        : detected === locale
          ? original
          : await translateOne(deps, em, options, source, locale)

    await inHouseholdTransaction(em.fork(), options.householdId, async (tx) => {
      await upsertTranslation(tx, {
        householdId: options.householdId,
        recipeId: recipe.id,
        locale,
        translation,
        translatedAt: new Date(),
      })
      await tx.flush()
    })
  }

  return recipeTranslationStatus(em.fork(), recipe.id)
}

function alignIngredients(
  source: { section: string | null; text: string; note: string | null }[],
  translated: TranslatedIngredient[]
): TranslatedIngredient[] {
  return source.map((item, index) => {
    const value = translated[index]
    return {
      section: value?.section ?? item.section,
      text: value?.text ?? item.text,
      note: value?.note ?? item.note,
    }
  })
}

function alignSteps(
  source: { section: string | null; text: string }[],
  translated: TranslatedStep[]
): TranslatedStep[] {
  return source.map((item, index) => {
    const value = translated[index]
    return {
      section: value?.section ?? item.section,
      text: value?.text ?? item.text,
    }
  })
}

export async function recipeTranslationStatus(
  em: EntityManager,
  recipeId: string
) {
  const translations = await em.find(RecipeTranslation, { recipe: recipeId })
  const locales = new Set(translations.map((t) => t.locale))
  return {
    supportedLocales: [...SUPPORTED_LOCALES],
    locales: [...locales],
    complete: SUPPORTED_LOCALES.every((locale) => locales.has(locale)),
    translations: translations.map((t) => ({
      locale: t.locale,
      name: t.name,
      description: t.description ?? null,
      yieldText: t.yieldText ?? null,
      notes: t.notes ?? null,
      ingredients: t.ingredients,
      steps: t.steps,
      translatedAt: t.translatedAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    })),
  }
}

export async function recipesMissingTranslations(
  em: EntityManager,
  options?: { householdId?: string; limit?: number }
) {
  const where: Record<string, unknown> = options?.householdId
    ? { household: options.householdId }
    : {}
  const recipes = await em.find(Recipe, where, {
    ...(options?.householdId ? {} : ACROSS_HOUSEHOLDS),
    populate: ["household"],
    fields: ["id", "household.id"],
    limit: options?.limit ?? 500,
  })
  if (recipes.length === 0) return []
  const ids = recipes.map((r) => r.id)
  const translations = await em.find(
    RecipeTranslation,
    { recipe: { $in: ids } },
    {
      ...(options?.householdId ? {} : ACROSS_HOUSEHOLDS),
      fields: ["recipe", "locale"],
    }
  )
  const byRecipe = new Map<string, Set<string>>()
  for (const t of translations) {
    const id = t.recipe.id
    const set = byRecipe.get(id) ?? new Set<string>()
    set.add(t.locale)
    byRecipe.set(id, set)
  }
  return recipes.filter((recipe) => {
    const locales = byRecipe.get(recipe.id)
    return !locales || !SUPPORTED_LOCALES.every((locale) => locales.has(locale))
  })
}
