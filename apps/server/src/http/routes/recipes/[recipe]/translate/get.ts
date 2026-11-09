import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { findRecipe } from "../../../../../services/recipes/recipes.ts"
import { recipeTranslationStatus } from "../../../../../services/recipes/translations/translate.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { RecipeParam } from "../../../../schemas/recipes.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"
import { RecipeTranslationsStatusSchema } from "../../../../schemas/translate.ts"

const route = createRoute({
  method: "get",
  path: "/recipes/{recipe}/translate",
  operationId: "getRecipeTranslations",
  tags: ["Recipes"],
  summary: "A recipe's translations",
  description:
    "The translations this recipe has for the languages Merran supports, and which languages are still missing.",
  ...openToKeys("recipes", "read"),
  request: { params: RecipeParam },
  responses: {
    200: jsonResponse(
      RecipeTranslationsStatusSchema,
      "Its translation status."
    ),
    404: errorResponse("No such recipe."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    const recipe = await findRecipe(em, c.req.valid("param").recipe)
    return c.json(await recipeTranslationStatus(em, recipe.id), 200)
  })
}
