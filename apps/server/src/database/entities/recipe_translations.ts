import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { householdFilter } from "../scope.ts"
import { id, updatedAt } from "./base.ts"
import { householdRef } from "./households.ts"
import { recipeRef } from "./recipes.ts"

export type TranslatedIngredient = {
  section: string | null
  text: string
  /** Translated preparation note, when the original line had one. */
  note: string | null
}

export type TranslatedStep = {
  section: string | null
  text: string
}

/**
 * A recipe's content translated into one locale. The original recipe stays
 * unchanged; translations are stored per locale so missing translations can
 * be found and generated.
 */
export const RecipeTranslation = defineEntity({
  name: "RecipeTranslation",
  tableName: "recipe_translations",
  properties: {
    id: id(),
    household: () => householdRef(),
    recipe: () => recipeRef(),
    /** Target locale code, e.g. "en" or "pl". */
    locale: p.string(),
    name: p.string(),
    description: p.text().nullable(),
    yieldText: p.string().nullable(),
    notes: p.text().nullable(),
    /** Translated ingredient lines in order, aligned to the recipe's ingredients. */
    ingredients: p.json<TranslatedIngredient[]>(),
    /** Translated steps in order, aligned to the recipe's steps. */
    steps: p.json<TranslatedStep[]>(),
    translatedAt: p.datetime(),
    updatedAt: updatedAt(),
  },
  uniques: [{ properties: ["recipe", "locale"] }],
  indexes: [{ properties: ["household", "locale"] }],
  filters: householdFilter,
})
export type RecipeTranslation = InferEntity<typeof RecipeTranslation>
