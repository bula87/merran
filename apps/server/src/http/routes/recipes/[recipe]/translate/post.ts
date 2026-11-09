import { createRoute, z } from "@hono/zod-openapi"
import { SUPPORTED_LOCALES } from "@merran/shared"
import type { AppDeps } from "../../../../../core/context.ts"
import { findRecipe } from "../../../../../services/recipes/recipes.ts"
import { recipeTranslationStatus } from "../../../../../services/recipes/translations/translate.ts"
import { startRecipeTranslation } from "../../../../../services/recipes/translations/job.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { RecipeParam } from "../../../../schemas/recipes.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"
import { RecipeTranslationsStatusSchema } from "../../../../schemas/translate.ts"

const StartedSchema = RecipeTranslationsStatusSchema.extend({
  jobId: z.string().nullable(),
  supportedLocales: z
    .array(z.string())
    .openapi({ example: [...SUPPORTED_LOCALES] }),
}).openapi("RecipeTranslationStarted")

const route = createRoute({
  method: "post",
  path: "/recipes/{recipe}/translate",
  operationId: "translateRecipe",
  tags: ["Recipes"],
  summary: "Translate a recipe",
  description:
    "Translates the recipe into every language Merran supports, in the background. Any member of the household can start it. Uses the household's translation model and counts towards its AI spend.",
  ...openToKeys("recipes", "write"),
  request: { params: RecipeParam },
  responses: {
    200: jsonResponse(
      StartedSchema,
      "Translation started, or already up to date."
    ),
    404: errorResponse("No such recipe."),
    429: errorResponse("This month's AI limit is reached."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    const recipe = await findRecipe(em, c.req.valid("param").recipe)
    const job = await startRecipeTranslation(em, {
      householdId,
      userId,
      recipeId: recipe.id,
    })
    const status = await recipeTranslationStatus(em, recipe.id)
    return c.json({ ...status, jobId: job.id }, 200)
  })
}
