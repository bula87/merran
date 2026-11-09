import { createRoute, z } from "@hono/zod-openapi"
import { bodyLimit } from "hono/body-limit"
import type { AppDeps } from "../../../../core/context.ts"
import { AppError } from "../../../../core/errors.ts"
import { analyzeMealPhoto } from "../../../../services/nutrition/meal-photo.ts"
import { MAX_PHOTO_BYTES } from "../../../../services/recipes/photos/photos.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"

const keys = openToKeys("recipes", "write")

const MealPhotoAnalysisSchema = z
  .object({
    name: z.string().nullable(),
    description: z.string().nullable(),
    serving: z.string().nullable(),
    confidence: z.enum(["low", "medium", "high"]).nullable(),
    calories: z.number().optional(),
    protein: z.number().optional(),
    carbs: z.number().optional(),
    fat: z.number().optional(),
    fiber: z.number().optional(),
    sugar: z.number().optional(),
    sodium: z.number().optional(),
    notes: z.string().nullable(),
  })
  .openapi("MealPhotoAnalysis", {
    description:
      "Estimated nutrition for the meal shown in the photo. Values are per serving as shown; unknown values are left out.",
    example: {
      name: "Chicken salad",
      description: "Grilled chicken, mixed greens, tomatoes and dressing.",
      serving: "1 plate",
      confidence: "medium",
      calories: 420,
      protein: 34,
      carbs: 18,
      fat: 24,
      fiber: 4,
      sugar: 6,
      sodium: 680,
      notes: "Dressing amount is uncertain.",
    },
  })

const route = createRoute({
  method: "post",
  path: "/nutrition/photo",
  operationId: "analyzeMealPhoto",
  tags: ["Nutrition"],
  summary: "Analyze a meal photo",
  description:
    "Estimates calories and nutrition from a photo of a meal. The result is an estimate for the serving shown.",
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
    200: jsonResponse(MealPhotoAnalysisSchema, "The estimated nutrition."),
    400: errorResponse("No photo, or the photo couldn't be read."),
    413: errorResponse("The photo is too large."),
    422: errorResponse("No meal found, or nutrition couldn't be estimated."),
    502: errorResponse("The AI provider failed."),
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
    const analysis = await analyzeMealPhoto(deps, em, {
      householdId,
      userId,
      photo: Buffer.from(await photo.arrayBuffer()),
    })
    return c.json(analysis, 200)
  })
}
