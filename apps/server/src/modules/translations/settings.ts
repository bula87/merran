import { numberSetting, switchSetting } from "../../core/settings.ts"
import { z } from "zod"

export const RECIPE_TRANSLATIONS = {
  enabled: switchSetting({
    key: "recipeTranslations.enabled",
    env: "MERRAN_RECIPE_TRANSLATIONS",
    default: false,
    description:
      "Translate recipes into all supported languages in the background.",
  }),
  hour: numberSetting({
    key: "recipeTranslations.hour",
    env: "MERRAN_RECIPE_TRANSLATIONS_HOUR",
    schema: z.number().int().min(0).max(23),
    default: 3,
    description:
      "Hour of day (0-23, server time) to run automatic recipe translations.",
  }),
}
