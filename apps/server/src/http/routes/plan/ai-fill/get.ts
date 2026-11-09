import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { activePlanAiFills } from "../../../../services/plan/ai-fill-run.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { AiFillRunListSchema } from "../../../schemas/plan.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/plan/ai-fill",
  operationId: "listPlanAiFills",
  tags: ["Plan"],
  summary: "List active and reviewable AI fill runs",
  ...openToKeys("plan", "read"),
  responses: {
    200: jsonResponse(AiFillRunListSchema, "AI fill runs."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    return c.json({ runs: await activePlanAiFills(em, householdId) }, 200)
  })
}
