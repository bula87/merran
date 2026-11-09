import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { User } from "../../../../../database/entities/index.ts"
import { signedIn } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  normalizeUserProfile,
  UserProfileSchema,
} from "../../../../schemas/user-profile.ts"
import {
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "patch",
  path: "/auth/me/profile",
  operationId: "updateMyProfile",
  tags: ["Sign-in"],
  summary: "Update your personal profile",
  description:
    "Saves your personal details and preferences for future meal planning.",
  security: SESSION_SECURITY,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: UserProfileSchema } },
    },
  },
  responses: {
    200: jsonResponse(UserProfileSchema, "Profile saved."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = c.var
    const { user } = signedIn(c)
    const profile = normalizeUserProfile(c.req.valid("json"))
    const person = await em.findOneOrFail(User, user.id)
    person.preferences = {
      ...(person.preferences ?? {}),
      profile,
    }
    await em.flush()
    return c.json(profile, 200)
  })
}
