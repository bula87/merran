import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import {
  describePlanAiFill,
  startPlanAiFill,
} from "../../../../services/plan/ai-fill-run.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { AiFillRunSchema, AiFillStartSchema } from "../../../schemas/plan.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/plan/ai-fill",
  operationId: "startPlanAiFill",
  tags: ["Plan"],
  summary: "Start filling the week with AI in the background",
  description:
    "Generates AI meal suggestions for the given slots in the background. Poll the run or list active runs to review suggestions, then apply or decline them.",
  ...openToKeys("plan", "write"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: AiFillStartSchema } },
    },
  },
  responses: {
    202: jsonResponse(AiFillRunSchema, "AI fill started."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    const { slots, exclude, week } = c.req.valid("json")
    const job = await startPlanAiFill(em, {
      householdId,
      userId,
      slots,
      exclude,
      week,
    })
    return c.json(describePlanAiFill(job), 202)
  })
}
