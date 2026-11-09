import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { approveMealLog } from "../../../../../services/meals/meal-logs.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  MealLogApproveSchema,
  MealLogParam,
  MealLogSchema,
} from "../../../../schemas/meal-logs.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/meal-logs/{logId}/approve",
  operationId: "approveMealLog",
  tags: ["Meal logs"],
  summary: "Approve a meal log",
  description:
    "Approves a reviewed meal log, optionally applying edits, and adds it to the meals log.",
  ...openToKeys("recipes", "write"),
  request: {
    params: MealLogParam,
    body: { content: { "application/json": { schema: MealLogApproveSchema } } },
  },
  responses: {
    200: jsonResponse(MealLogSchema, "The approved meal log."),
    404: errorResponse("No such meal log."),
    409: errorResponse("Already approved."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    const log = await approveMealLog(
      em,
      c.req.valid("param").logId,
      c.req.valid("json"),
      deps
    )
    return c.json(log, 200)
  })
}
