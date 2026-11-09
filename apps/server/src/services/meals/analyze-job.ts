import {
  applyMealLogAnalysis,
  failMealLogAnalysis,
  getMealLog,
} from "./meal-logs.ts"
import { analyzeMealPhoto } from "../nutrition/meal-photo.ts"
import { analyzeMealText } from "../nutrition/meal-text.ts"
import type { JobHandler } from "../jobs/runner.ts"

export const MEAL_LOG_ANALYZE_KIND = "meal-log.analyze"
const TIMEOUT_MS = 6 * 60 * 1000

/**
 * Analyzes a meal log's photo or text (up to 6 minutes) and stores a
 * review-ready result.
 */
export const mealLogAnalyzeJob: JobHandler = {
  kind: MEAL_LOG_ANALYZE_KIND,
  concurrency: 1,
  async run(ctx) {
    const logId = ctx.payload.logId
    if (typeof logId !== "string" || !logId)
      throw new Error("Missing meal log.")
    if (!ctx.householdId) throw new Error("Missing household.")

    const abortSignal = AbortSignal.any([
      ctx.signal,
      AbortSignal.timeout(TIMEOUT_MS),
    ])

    try {
      const log = await getMealLog(ctx.em, logId)
      if (log.status !== "processing") return { skipped: true }

      let analysis
      if (log.source === "photo" && log.inputPhotoKey) {
        const photo = await ctx.deps.files.read(log.inputPhotoKey)
        if (!photo) throw new Error("The photo is no longer available.")
        analysis = await analyzeMealPhoto(ctx.deps, ctx.em, {
          householdId: ctx.householdId,
          userId: log.user?.id ?? null,
          photo,
          abortSignal,
        })
      } else if (log.inputText?.trim()) {
        analysis = await analyzeMealText(ctx.deps, ctx.em, {
          householdId: ctx.householdId,
          userId: log.user?.id ?? null,
          text: log.inputText,
          abortSignal,
        })
      } else {
        throw new Error("Nothing to analyze.")
      }

      await applyMealLogAnalysis(ctx.em, logId, analysis)
      return { logId, status: "ready" }
    } catch (error) {
      const message =
        abortSignal.aborted && !ctx.signal.aborted
          ? "Analyzing took too long. Try again."
          : error instanceof Error
            ? error.message
            : "Analysis failed."
      await failMealLogAnalysis(ctx.em, logId, message).catch(() => {})
      return { logId, status: "failed", error: message }
    }
  },
}
