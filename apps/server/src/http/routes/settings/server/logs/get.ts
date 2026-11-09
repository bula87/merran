import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { serverAdmin } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { ServerLogsQuerySchema, ServerLogsSchema } from "../../../../schemas/logs.ts"
import {
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/settings/server/logs",
  operationId: "getServerLogs",
  tags: ["Settings"],
  summary: "Server logs",
  description:
    "Server admins only. Recent server log entries, including AI processing logs (model, input, output).",
  security: SESSION_SECURITY,
  request: { query: ServerLogsQuerySchema },
  responses: {
    200: jsonResponse(ServerLogsSchema, "Recent log entries."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    serverAdmin(c)
    const { limit, level } = c.req.valid("query")
    return c.json({ entries: deps.logs.entries({ limit, level }) }, 200)
  })
}
