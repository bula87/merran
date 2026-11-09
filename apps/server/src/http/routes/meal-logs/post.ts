import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../core/context.ts"
import { createMealLog } from "../../../services/meals/meal-logs.ts"
import { inHousehold, openToKeys } from "../../middleware/auth.ts"
import type { Router } from "../../router.ts"
import { MealLogInputSchema, MealLogSchema } from "../../schemas/meal-logs.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/meal-logs",
  operationId: "createMealLog",
  tags: ["Meal logs"],
  summary: "Add a meal log",
  description:
    "Logs a meal with optional nutrition, from a photo analysis, a recipe, or manual entry.",
  ...openToKeys("recipes", "write"),
  request: {
    body: { content: { "application/json": { schema: MealLogInputSchema } } },
  },
  responses: {
    201: jsonResponse(MealLogSchema, "The meal log."),
    404: errorResponse("No such recipe."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    const log = await createMealLog(em, {
      householdId,
      userId,
      input: c.req.valid("json"),
    })
    return c.json(log, 201)
  })
}
