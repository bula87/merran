import { createRoute, z } from "@hono/zod-openapi"
import { streamSSE } from "hono/streaming"

import { AppError } from "../../../../../core/errors.ts"
import type { AppDeps } from "../../../../../core/context.ts"
import { User } from "../../../../../database/entities/index.ts"
import { aiSuggestMeals } from "../../../../../services/plan/ai-suggest.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { SuggestRequestSchema } from "../../../../schemas/plan.ts"
import {
  normalizeUserProfile,
  emptyUserProfile,
} from "../../../../schemas/user-profile.ts"
import { SIGNED_IN_ERRORS } from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/plan/suggest/ai",
  operationId: "suggestMealsAi",
  tags: ["Plan"],
  summary: "Suggest meals with AI",
  description:
    "Uses AI to suggest recipes for the given slots based on available recipes, household context, and your personal profile (allergies, preferences, goals). Streams progress/status events and a final result with the same suggestion shape as Fill the week; nothing is planned until you add it. Max calories per day is guided to 2000 kcal for now.",
  ...openToKeys("plan", "read"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: SuggestRequestSchema } },
    },
  },
  responses: {
    200: {
      description:
        'Server-sent events: `status` (`{"status":"requesting_large_model"|"fallback_small_model"}`), `result` (`{"suggestions":[...]}`), or `error` (`{"code","message","fields"}`).',
      content: { "text/event-stream": { schema: z.string() } },
    },
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    const { slots, exclude } = c.req.valid("json")
    const person = await c.var.em.findOne(User, userId, {
      fields: ["preferences"],
    })
    const profile = normalizeUserProfile(
      person?.preferences?.profile ?? emptyUserProfile
    )
    c.header("Cache-Control", "no-cache, no-transform")
    c.header("X-Accel-Buffering", "no")
    return streamSSE(c, async (stream) => {
      try {
        const suggestions = await aiSuggestMeals(deps, em, {
          householdId,
          userId,
          slots,
          exclude,
          profile,
          maxCaloriesPerDay: 2000,
          onStatus: (status) =>
            stream.writeSSE({
              event: "status",
              data: JSON.stringify({ status }),
            }),
        })
        await stream.writeSSE({
          event: "result",
          data: JSON.stringify({ suggestions }),
        })
      } catch (error) {
        if (error instanceof AppError) {
          await stream.writeSSE({
            event: "error",
            data: JSON.stringify({
              code: error.code,
              message: error.message,
              fields: error.fields ?? {},
            }),
          })
          return
        }
        deps.logger?.error({ err: error }, "AI suggest meals failed")
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({
            code: "upstream",
            message: "Something went wrong while filling the week with AI.",
            fields: {},
          }),
        })
      }
    }) as never
  })
}
