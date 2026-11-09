import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { User } from "../../../../../database/entities/index.ts"
import { aiSuggestMeals } from "../../../../../services/plan/ai-suggest.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  SuggestionsSchema,
  SuggestRequestSchema,
} from "../../../../schemas/plan.ts"
import {
  normalizeUserProfile,
  emptyUserProfile,
} from "../../../../schemas/user-profile.ts"
import {
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/plan/suggest/ai",
  operationId: "suggestMealsAi",
  tags: ["Plan"],
  summary: "Suggest meals with AI",
  description:
    "Uses AI to suggest recipes for the given slots based on available recipes, household context, and your personal profile (allergies, preferences, goals). Returns the same suggestion shape as Fill the week; nothing is planned until you add it. Max calories per day is guided to 2000 kcal for now.",
  ...openToKeys("plan", "read"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: SuggestRequestSchema } },
    },
  },
  responses: {
    200: jsonResponse(SuggestionsSchema, "AI meal ideas, in the slots' order."),
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
    const suggestions = await aiSuggestMeals(deps, em, {
      householdId,
      userId,
      slots,
      exclude,
      profile,
      maxCaloriesPerDay: 2000,
    })
    return c.json({ suggestions }, 200)
  })
}
