import { createRoute } from "@hono/zod-openapi"
import { z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { describeMe, MeSchema } from "../../../../schemas/auth.ts"
import { User } from "../../../../../database/entities/index.ts"
import { signedIn } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const LanguageSchema = z.object({
  language: z.string().min(1).nullable(),
})

const route = createRoute({
  method: "patch",
  path: "/auth/me/language",
  operationId: "updateLanguage",
  tags: ["Sign-in"],
  summary: "Set the UI language",
  description: "The chosen language belongs to the signed-in person.",
  security: SESSION_SECURITY,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: LanguageSchema } },
    },
  },
  responses: {
    200: jsonResponse(MeSchema, "Language saved."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = c.var
    const { user } = signedIn(c)
    const { language } = c.req.valid("json")
    const person = await em.findOneOrFail(User, user.id)
    const preferences = person.preferences ?? {}
    person.preferences = {
      ...preferences,
      ...(language ? { language } : { language: undefined }),
    }
    await em.flush()
    return c.json(
      await describeMe(
        em,
        user,
        c.var.household?.id ?? null,
        person.preferences ?? null
      ),
      200
    )
  })
}
