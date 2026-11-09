import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { User } from "../../../../../database/entities/index.ts"
import { signedIn } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  emptyUserProfile,
  normalizeUserProfile,
  UserProfileSchema,
} from "../../../../schemas/user-profile.ts"
import {
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/auth/me/profile",
  operationId: "getMyProfile",
  tags: ["Sign-in"],
  summary: "Get your personal profile",
  description:
    "Your personal details and preferences used for meal planning, such as physical data, food preferences, meals, cooking devices, and goals.",
  security: SESSION_SECURITY,
  responses: {
    200: jsonResponse(UserProfileSchema, "Your profile."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = c.var
    const { user } = signedIn(c)
    const person = await em.findOne(User, user.id, { fields: ["preferences"] })
    return c.json(
      normalizeUserProfile(person?.preferences?.profile ?? emptyUserProfile),
      200
    )
  })
}
