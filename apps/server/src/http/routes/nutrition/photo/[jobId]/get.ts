import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { AppError } from "../../../../../core/errors.ts"
import { describeJob, findJob } from "../../../../../services/jobs/jobs.ts"
import { MEAL_PHOTO_ANALYSIS_KIND } from "../../../../../services/nutrition/photo-job.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  MealPhotoAnalysisSchema,
  MealPhotoJobStatusSchema,
} from "../../../../schemas/meal-photo.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const keys = openToKeys("recipes", "write")

const route = createRoute({
  method: "get",
  path: "/nutrition/photo/{jobId}",
  operationId: "getMealPhotoAnalysisJob",
  tags: ["Nutrition"],
  summary: "Get meal photo analysis",
  description:
    "Returns the status and result of a background meal photo analysis job.",
  ...keys,
  request: {
    params: z.object({ jobId: z.string() }),
  },
  responses: {
    200: jsonResponse(MealPhotoJobStatusSchema, "The analysis job status."),
    404: errorResponse("No such analysis job."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const job = await findJob(c.var.em, c.req.valid("param").jobId, householdId)
    if (job.kind !== MEAL_PHOTO_ANALYSIS_KIND) {
      throw new AppError(
        "not_found",
        "job_not_found",
        "There's no such analysis job."
      )
    }
    const described = describeJob(job)
    const analysis =
      job.status === "done" &&
      described.result &&
      typeof described.result === "object" &&
      "analysis" in described.result
        ? MealPhotoAnalysisSchema.safeParse(
            (described.result as { analysis?: unknown }).analysis
          )
        : null
    return c.json(
      {
        jobId: job.id,
        status: job.status,
        analysis: analysis?.success ? analysis.data : null,
        error: job.error ?? null,
      },
      200
    )
  })
}
