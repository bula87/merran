import { createRoute } from "@hono/zod-openapi"
import { z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { declinePlanAiFill } from "../../../../../../services/plan/ai-fill-run.ts"
import { inHousehold, openToKeys } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import { AiFillRunParam } from "../../../../../schemas/plan.ts"
import {
  jsonResponse,
  SIGNED_IN_ERRORS,
  errorResponse,
} from "../../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/plan/ai-fill/{runId}/decline",
  operationId: "declinePlanAiFill",
  tags: ["Plan"],
  summary: "Decline or stop an AI fill run",
  ...openToKeys("plan", "write"),
  request: { params: AiFillRunParam },
  responses: {
    200: jsonResponse(z.object({ ok: z.literal(true) }), "Declined."),
    404: errorResponse("No such AI fill run in this household."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    await declinePlanAiFill(em, c.req.valid("param").runId, householdId, (id) =>
      deps.jobs.stopJob(id)
    )
    return c.json({ ok: true as const }, 200)
  })
}
