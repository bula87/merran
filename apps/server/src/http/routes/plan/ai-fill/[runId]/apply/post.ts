import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { applyPlanAiFill } from "../../../../../../services/plan/ai-fill-run.ts"
import { inHousehold, openToKeys } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import {
  AiFillApplySchema,
  AiFillRunParam,
  PlanEntriesSchema,
} from "../../../../../schemas/plan.ts"
import {
  jsonResponse,
  SIGNED_IN_ERRORS,
  errorResponse,
} from "../../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/plan/ai-fill/{runId}/apply",
  operationId: "applyPlanAiFill",
  tags: ["Plan"],
  summary: "Apply reviewed AI fill suggestions to the plan",
  ...openToKeys("plan", "write"),
  request: {
    params: AiFillRunParam,
    body: {
      required: true,
      content: { "application/json": { schema: AiFillApplySchema } },
    },
  },
  responses: {
    200: jsonResponse(PlanEntriesSchema, "Meals added to the plan."),
    404: errorResponse("No such AI fill run in this household."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const { entries } = c.req.valid("json")
    const result = await applyPlanAiFill(
      em,
      c.req.valid("param").runId,
      householdId,
      entries.map((entry) => ({
        ...entry,
        why: entry.why ?? undefined,
      }))
    )
    return c.json(result, 200)
  })
}
