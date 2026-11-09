import { createRoute, z } from "@hono/zod-openapi"
import { bodyLimit } from "hono/body-limit"
import { randomUUID } from "node:crypto"
import type { AppDeps } from "../../../../core/context.ts"
import { AppError } from "../../../../core/errors.ts"
import { MEAL_PHOTO_ANALYSIS_KIND } from "../../../../services/nutrition/photo-job.ts"
import { enqueue } from "../../../../services/jobs/jobs.ts"
import { MAX_PHOTO_BYTES } from "../../../../services/recipes/photos/photos.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { MealPhotoJobSchema } from "../../../schemas/meal-photo.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"

const keys = openToKeys("recipes", "write")

const route = createRoute({
  method: "post",
  path: "/nutrition/photo",
  operationId: "analyzeMealPhoto",
  tags: ["Nutrition"],
  summary: "Analyze a meal photo",
  description:
    "Starts background analysis of a meal photo (up to 6 minutes). Poll the returned job to get the estimated nutrition.",
  ...keys,
  request: {
    body: {
      content: {
        "multipart/form-data": {
          schema: z.object({
            photo: z.any().openapi({ type: "string", format: "binary" }),
          }),
        },
      },
    },
  },
  responses: {
    202: jsonResponse(MealPhotoJobSchema, "The analysis job."),
    400: errorResponse("No photo, or the photo couldn't be read."),
    413: errorResponse("The photo is too large."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.use(
    "/nutrition/photo",
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
    const body = await c.req.parseBody({ all: true })
    const photo = body.photo
    if (!(photo instanceof File)) {
      throw new AppError("invalid", "no_photo", "Add a photo.", {
        photo: "Add a photo.",
      })
    }
    const bytes = Buffer.from(await photo.arrayBuffer())
    if (bytes.length === 0) {
      throw new AppError("invalid", "no_photo", "Add a photo.", {
        photo: "Add a photo.",
      })
    }
    const fileKey = `tmp/meal-photo/${randomUUID()}.jpg`
    await deps.files.put(fileKey, bytes)
    const job = await enqueue(em, {
      kind: MEAL_PHOTO_ANALYSIS_KIND,
      householdId,
      createdBy: userId,
      maxAttempts: 1,
      payload: { fileKey, userId },
    })
    return c.json({ jobId: job.id, status: job.status }, 202)
  })
}
