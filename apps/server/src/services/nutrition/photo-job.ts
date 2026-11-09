import type { JobHandler } from "../jobs/runner.ts"
import { analyzeMealPhoto } from "./meal-photo.ts"

export const MEAL_PHOTO_ANALYSIS_KIND = "nutrition.analyzeMealPhoto"
const TIMEOUT_MS = 6 * 60 * 1000

function isTimeout(error: unknown) {
  return (
    (error instanceof DOMException && error.name === "TimeoutError") ||
    (error instanceof Error && error.name === "TimeoutError")
  )
}

/**
 * Analyzes a meal photo in the background (up to 6 minutes), so the user
 * can leave and come back to the result.
 */
export const mealPhotoAnalysisJob: JobHandler = {
  kind: MEAL_PHOTO_ANALYSIS_KIND,
  concurrency: 1,
  async run(ctx) {
    const fileKey = ctx.payload.fileKey
    if (typeof fileKey !== "string" || !fileKey) {
      throw new Error("Missing photo file.")
    }

    const abortSignal = AbortSignal.any([
      ctx.signal,
      AbortSignal.timeout(TIMEOUT_MS),
    ])

    try {
      const photo = await ctx.deps.files.read(fileKey)
      if (!photo) throw new Error("The photo is no longer available.")
      if (!ctx.householdId) throw new Error("Missing household.")

      const analysis = await analyzeMealPhoto(ctx.deps, ctx.em, {
        householdId: ctx.householdId,
        userId:
          typeof ctx.payload.userId === "string" ? ctx.payload.userId : null,
        photo,
        abortSignal,
      })
      return { analysis }
    } catch (error) {
      if (abortSignal.aborted && !ctx.signal.aborted) {
        throw new Error(
          "Analyzing the photo took too long. Try again, or use a clearer photo."
        )
      }
      if (isTimeout(error)) {
        throw new Error(
          "Analyzing the photo took too long. Try again, or use a clearer photo."
        )
      }
      throw error
    } finally {
      await ctx.deps.files.remove(fileKey).catch(() => {})
    }
  },
}
