import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { deleteMealLog } from "../../../../services/meals/meal-logs.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { MealLogParam } from "../../../schemas/meal-logs.ts"
import { errorResponse, SIGNED_IN_ERRORS } from "../../../schemas/responses.ts"

const route = createRoute({
  method: "delete",
  path: "/meal-logs/{logId}",
  operationId: "deleteMealLog",
  tags: ["Meal logs"],
  summary: "Delete a meal log",
  ...openToKeys("recipes", "write"),
  request: { params: MealLogParam },
  responses: {
    204: { description: "Deleted." },
    404: errorResponse("No such meal log."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    await deleteMealLog(em, c.req.valid("param").logId, deps)
    return c.body(null, 204)
  })
}
