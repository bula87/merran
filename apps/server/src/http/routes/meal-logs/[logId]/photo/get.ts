import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { AppError } from "../../../../../core/errors.ts"
import { getMealLog } from "../../../../../services/meals/meal-logs.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { MealLogParam } from "../../../../schemas/meal-logs.ts"
import {
  errorResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/meal-logs/{logId}/photo",
  operationId: "getMealLogPhoto",
  tags: ["Meal logs"],
  summary: "Get a meal log photo",
  description: "Returns the uploaded photo for a meal log in review.",
  ...openToKeys("recipes", "read"),
  request: { params: MealLogParam },
  responses: {
    200: {
      description: "The photo.",
      content: {
        "image/jpeg": { schema: { type: "string", format: "binary" } },
      },
    },
    404: errorResponse("No such meal log or photo."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    const log = await getMealLog(em, c.req.valid("param").logId)
    if (!log.inputPhotoKey) {
      throw new AppError("not_found", "no_photo", "No photo for that meal log.")
    }
    const file = await deps.files.read(log.inputPhotoKey)
    if (!file) {
      throw new AppError("not_found", "no_photo", "No photo for that meal log.")
    }
    return c.body(new Uint8Array(file), 200, {
      "Content-Type": "image/jpeg",
    }) as never
  })
}
