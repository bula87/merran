import { scheduleRecipeTranslations } from "../../services/recipes/translations/job.ts"
import type { Module } from "../module.ts"
import { RECIPE_TRANSLATIONS } from "./settings.ts"

/**
 * Automatic recipe translations: translates recipes into the languages
 * Merran supports, on a schedule the server admin sets.
 */
export const translations: Module = {
  id: "translations",
  settings: Object.values(RECIPE_TRANSLATIONS),
  capabilities: ["ai"],

  async status({ settings }) {
    const enabled = await settings.server(RECIPE_TRANSLATIONS.enabled)
    if (!enabled) return { on: false, needs: "off" }
    return { on: true }
  },

  async apply(ctx) {
    await scheduleRecipeTranslations(ctx)
  },
}
