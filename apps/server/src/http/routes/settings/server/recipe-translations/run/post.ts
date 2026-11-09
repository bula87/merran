import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { enqueue } from "../../../../../../services/jobs/jobs.ts"
import { TRANSLATE_RECIPES_JOB } from "../../../../../../services/recipes/translations/job.ts"
import { serverAdmin } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import {
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/settings/server/recipe-translations/run",
  operationId: "runRecipeTranslations",
  tags: ["Settings"],
  summary: "Run recipe translations now",
  description:
    "Server admins only. Enqueues a batch translation run that translates recipes missing translations, up to the configured maximum per run.",
  security: SESSION_SECURITY,
  responses: {
    200: jsonResponse(
      z.object({ queued: z.boolean() }).openapi({ example: { queued: true } }),
      "A translation batch was queued."
    ),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    serverAdmin(c)
    await enqueue(c.var.em, {
      kind: TRANSLATE_RECIPES_JOB,
      payload: { scheduled: false },
      maxAttempts: 1,
    })
    return c.json({ queued: true }, 200)
  })
}
