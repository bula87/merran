import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import {
  describePlanAiFill,
  findPlanAiFill,
} from "../../../../../services/plan/ai-fill-run.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { AiFillRunParam, AiFillRunSchema } from "../../../../schemas/plan.ts"
import {
  jsonResponse,
  SIGNED_IN_ERRORS,
  errorResponse,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/plan/ai-fill/{runId}",
  operationId: "getPlanAiFill",
  tags: ["Plan"],
  summary: "Get an AI fill run",
  ...openToKeys("plan", "read"),
  request: { params: AiFillRunParam },
  responses: {
    200: jsonResponse(AiFillRunSchema, "The AI fill run."),
    404: errorResponse("No such AI fill run in this household."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const job = await findPlanAiFill(
      em,
      c.req.valid("param").runId,
      householdId
    )
    return c.json(describePlanAiFill(job), 200)
  })
}
