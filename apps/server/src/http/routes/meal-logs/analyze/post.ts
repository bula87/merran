import { createRoute, z } from "@hono/zod-openapi"
import { bodyLimit } from "hono/body-limit"
import { randomUUID } from "node:crypto"
import type { AppDeps } from "../../../../core/context.ts"
import { AppError } from "../../../../core/errors.ts"
import { enqueue } from "../../../../services/jobs/jobs.ts"
import { MEAL_LOG_ANALYZE_KIND } from "../../../../services/meals/analyze-job.ts"
import {
  createMealLogForAnalysis,
  toMealLogDto,
} from "../../../../services/meals/meal-logs.ts"
import { MAX_PHOTO_BYTES } from "../../../../services/recipes/photos/photos.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import {
  MealLogAnalyzeTextSchema,
  MealLogSchema,
} from "../../../schemas/meal-logs.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/meal-logs/analyze",
  operationId: "analyzeMealLog",
  tags: ["Meal logs"],
  summary: "Add a meal log for review",
  description:
    "Uploads a meal photo or text description, analyzes it in the background, and adds a meal log to review.",
  ...openToKeys("recipes", "write"),
  request: {
    body: {
      content: {
        "multipart/form-data": {
          schema: z.object({
            photo: z
              .any()
              .optional()
              .openapi({ type: "string", format: "binary" }),
            text: z.string().optional(),
          }),
        },
        "application/json": { schema: MealLogAnalyzeTextSchema },
      },
    },
  },
  responses: {
    202: jsonResponse(MealLogSchema, "The meal log being analyzed."),
    400: errorResponse("No photo or text provided."),
    413: errorResponse("The photo is too large."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.use(
    "/meal-logs/analyze",
    bodyLimit({
      maxSize: MAX_PHOTO_BYTES,
      onError: (c) =>
        c.json(
          {
            error: {
              code: "too_large",
              message: "That photo is too large. Use a smaller one.",
              fields: { photo: "Use a smaller photo." },
            },
          },
          413
        ),
    })
  )

  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    const contentType = c.req.header("content-type") ?? ""

    let source: "photo" | "text"
    let inputText: string | null = null
    let inputPhotoKey: string | null = null
    let name = "Meal"

    if (contentType.includes("application/json")) {
      const body = c.req.valid("json")
      source = "text"
      inputText = body.text!.trim()
      name = inputText.split(/\n/)[0]?.slice(0, 80).trim() || "Meal"
    } else {
      const body = await c.req.parseBody({ all: true })
      const photo = body.photo
      const text = typeof body.text === "string" ? body.text.trim() : ""
      if (photo instanceof File) {
        const bytes = Buffer.from(await photo.arrayBuffer())
        if (bytes.length === 0) {
          throw new AppError(
            "invalid",
            "no_photo",
            "Add a photo or description.",
            {
              photo: "Add a photo or description.",
            }
          )
        }
        source = "photo"
        inputPhotoKey = `review/meal-logs/${randomUUID()}.jpg`
        await deps.files.put(inputPhotoKey, bytes)
        if (text) inputText = text
        name = "Meal photo"
      } else if (text) {
        source = "text"
        inputText = text
        name = text.split(/\n/)[0]?.slice(0, 80).trim() || "Meal"
      } else {
        throw new AppError(
          "invalid",
          "no_meal_input",
          "Add a photo or describe the meal.",
          { text: "Add a photo or describe the meal." }
        )
      }
    }

    const log = await createMealLogForAnalysis(em, {
      householdId,
      userId,
      source,
      name,
      inputText,
      inputPhotoKey,
    })
    await enqueue(em, {
      kind: MEAL_LOG_ANALYZE_KIND,
      householdId,
      createdBy: userId,
      maxAttempts: 1,
      payload: { logId: log.id },
    })
    await em.populate(log, ["recipe"])
    return c.json(toMealLogDto(log), 202)
  })
}
