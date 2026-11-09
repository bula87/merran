import { z } from "zod"
import { Job } from "../../../database/entities/index.ts"
import { enqueue } from "../../jobs/jobs.ts"
import {
  type JobContext,
  type JobHandler,
  JobStopped,
} from "../../jobs/runner.ts"
import { RECIPE_TRANSLATIONS } from "../../../modules/translations/settings.ts"
import { recipesMissingTranslations, translateRecipe } from "./translate.ts"

export const TRANSLATE_RECIPES_JOB = "recipes.translate"
export const TRANSLATE_RECIPES_SCHEDULE_KEY = `schedule:${TRANSLATE_RECIPES_JOB}`

const Payload = z.object({
  recipe: z.string().optional(),
  userId: z.string().nullable().optional(),
  scheduled: z.boolean().optional(),
})

function nextRunAt(hour: number, now = new Date()) {
  const next = new Date(now)
  next.setMinutes(0, 0, 0)
  next.setHours(hour)
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1)
  }
  // A small spread so servers don't all start at once.
  next.setSeconds(Math.floor(Math.random() * 15 * 60))
  return next
}

export async function scheduleRecipeTranslations(
  deps: Pick<JobContext["deps"], "settings" | "database">
) {
  const em = deps.database.em.fork()
  await em.nativeDelete(Job, {
    kind: TRANSLATE_RECIPES_JOB,
    key: TRANSLATE_RECIPES_SCHEDULE_KEY,
    status: "queued",
  })
  if (!(await deps.settings.server(RECIPE_TRANSLATIONS.enabled))) return null
  const hour = await deps.settings.server(RECIPE_TRANSLATIONS.hour)
  const runAt = nextRunAt(hour)
  await enqueue(em, {
    kind: TRANSLATE_RECIPES_JOB,
    key: TRANSLATE_RECIPES_SCHEDULE_KEY,
    runAt,
    maxAttempts: 1,
    payload: { scheduled: true },
  })
  return runAt
}

export async function startRecipeTranslation(
  em: import("@mikro-orm/sql").EntityManager,
  options: { householdId: string; userId: string | null; recipeId: string }
) {
  return enqueue(em, {
    kind: TRANSLATE_RECIPES_JOB,
    householdId: options.householdId,
    key: `recipe-translation:${options.recipeId}`,
    payload: { recipe: options.recipeId, userId: options.userId },
    createdBy: options.userId,
    maxAttempts: 2,
  })
}

export const translateRecipesJob: JobHandler = {
  kind: TRANSLATE_RECIPES_JOB,
  concurrency: 2,
  async run(ctx) {
    const payload = Payload.parse(ctx.payload)

    if (payload.recipe && ctx.householdId) {
      await ctx.progress(0, 1)
      await translateRecipe(ctx.deps, ctx.em, {
        householdId: ctx.householdId,
        userId: payload.userId ?? null,
        recipe: payload.recipe,
      })
      await ctx.progress(1, 1)
      return { recipe: payload.recipe, translated: true }
    }

    // Scheduled dispatcher: find recipes missing translations and enqueue them.
    if (
      !(await ctx.deps.settings.server(RECIPE_TRANSLATIONS.enabled)) &&
      payload.scheduled
    ) {
      return { off: true }
    }

    const maxPerRun = await ctx.deps.settings.server(
      RECIPE_TRANSLATIONS.maxPerRun
    )
    const missing = await recipesMissingTranslations(ctx.em, {
      limit: Math.max(500, maxPerRun * 10),
    })
    const batch = missing.slice(0, maxPerRun)
    let queued = 0
    let done = 0
    await ctx.progress(0, batch.length)
    for (const recipe of batch) {
      if (ctx.signal.aborted) throw new JobStopped("cancelled")
      const householdId = recipe.household.id
      await enqueue(ctx.em, {
        kind: TRANSLATE_RECIPES_JOB,
        householdId,
        key: `recipe-translation:${recipe.id}`,
        payload: { recipe: recipe.id, scheduled: true },
        maxAttempts: 2,
      })
      queued++
      done++
      await ctx.progress(done, batch.length, { queued })
    }

    if (payload.scheduled) {
      await scheduleRecipeTranslations(ctx.deps)
    }

    return { queued, total: missing.length, maxPerRun }
  },
}
