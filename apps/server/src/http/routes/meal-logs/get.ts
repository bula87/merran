import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../core/context.ts"
import { listMealLogs } from "../../../services/meals/meal-logs.ts"
import { inHousehold, openToKeys } from "../../middleware/auth.ts"
import type { Router } from "../../router.ts"
import {
  MealLogListQuerySchema,
  MealLogListSchema,
} from "../../schemas/meal-logs.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/meal-logs",
  operationId: "listMealLogs",
  tags: ["Meal logs"],
  summary: "List meal logs",
  description: "Meals logged by the household, newest first.",
  ...openToKeys("recipes", "read"),
  request: { query: MealLogListQuerySchema },
  responses: {
    200: jsonResponse(MealLogListSchema, "The meal logs."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const query = c.req.valid("query")
    return c.json(
      await listMealLogs(em, householdId, {
        limit: query.limit,
        offset: query.offset,
        status: query.status,
      }),
      200
    )
  })
}
