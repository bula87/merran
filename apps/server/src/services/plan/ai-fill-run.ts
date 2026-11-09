import type { EntityManager } from "@mikro-orm/sql"
import { z } from "zod"

import { AppError } from "../../core/errors.ts"
import { Job } from "../../database/entities/index.ts"
import { ACTIVE, enqueue, findJob } from "../jobs/jobs.ts"
import { type JobHandler } from "../jobs/runner.ts"
import { normalizeUserProfile } from "../../http/schemas/user-profile.ts"
import { User } from "../../database/entities/index.ts"
import { addEntries } from "./plan.ts"
import { aiSuggestMeals, type AiSuggestStatus } from "./ai-suggest.ts"
import type { Slot, Suggestion } from "./suggest.ts"

// AI Fill the week as a background job: generates meal suggestions for
// review, then applies only what the user approves.

export const PLAN_AI_FILL_KIND = "plan.aiFill"

/** Max slots per AI request to keep structured output reliable. */
const CHUNK_SIZE = 7

const Payload = z.object({
  slots: z.array(z.object({ date: z.string(), meal: z.string() })),
  exclude: z.array(z.string()).optional(),
  userId: z.string().nullable(),
  week: z.string().nullable().optional(),
})

const SoFar = z.object({
  week: z.string().nullable(),
  status: z.enum([
    "queued",
    "running",
    "ready",
    "failed",
    "applied",
    "declined",
  ]),
  slots: z.array(z.object({ date: z.string(), meal: z.string() })),
  suggestions: z.array(z.record(z.string(), z.unknown())),
  error: z.string().nullable(),
  appliedAt: z.string().nullable(),
  phase: z
    .enum(["requesting_large_model", "fallback_small_model", "merging"])
    .nullable(),
  done: z.number().int(),
  total: z.number().int(),
})

export type PlanAiFillStatus =
  "running" | "ready" | "failed" | "cancelled" | "applied" | "declined"

export type PlanAiFillPhase =
  "requesting_large_model" | "fallback_small_model" | "merging"

export type PlanAiFillRun = {
  id: string
  status: PlanAiFillStatus
  week: string | null
  total: number
  done: number
  phase: PlanAiFillPhase | null
  suggestions: Suggestion[]
  error: string | null
  appliedAt: string | null
  createdAt: string
  finishedAt: string | null
}

function initialResult(slots: readonly Slot[], week: string | null) {
  return {
    week,
    status: "queued" as const,
    slots: slots.map((s) => ({ date: s.date, meal: s.meal })),
    suggestions: [] as unknown[],
    error: null,
    appliedAt: null,
    phase: null,
    done: 0,
    total: slots.length,
  }
}

export async function startPlanAiFill(
  em: EntityManager,
  options: {
    householdId: string
    userId: string
    slots: readonly Slot[]
    exclude?: readonly string[]
    week?: string | null
  }
) {
  if (options.slots.length === 0) {
    throw new AppError("invalid", "no_slots", "There are no meals to fill.", {
      slots: "There are no meals to fill.",
    })
  }
  const week = options.week ?? null
  return enqueue(em, {
    kind: PLAN_AI_FILL_KIND,
    householdId: options.householdId,
    createdBy: options.userId,
    payload: {
      slots: options.slots.map((s) => ({ date: s.date, meal: s.meal })),
      exclude: options.exclude ? [...options.exclude] : [],
      userId: options.userId,
      week,
    },
    maxAttempts: 1,
    result: initialResult(options.slots, week),
  })
}

export async function findPlanAiFill(
  em: EntityManager,
  runId: string,
  householdId: string
) {
  const job = await findJob(em, runId, householdId).catch((err) => {
    if (err instanceof AppError) return null
    throw err
  })
  if (!job || job.kind !== PLAN_AI_FILL_KIND) {
    throw new AppError(
      "not_found",
      "ai_fill_not_found",
      "There's no such AI fill run."
    )
  }
  return job
}

export async function activePlanAiFills(
  em: EntityManager,
  householdId: string
) {
  const jobs = await em.find(
    Job,
    {
      kind: PLAN_AI_FILL_KIND,
      forHousehold: householdId,
      status: { $in: [...ACTIVE] },
    },
    { orderBy: { createdAt: "desc" } }
  )
  const recentDone = await em.find(
    Job,
    {
      kind: PLAN_AI_FILL_KIND,
      forHousehold: householdId,
      status: "done",
    },
    { orderBy: { createdAt: "desc" }, limit: 5 }
  )
  const reviewable = recentDone.filter((job) => {
    const r = SoFar.safeParse(job.result)
    return r.success && r.data.status === "ready"
  })
  return [...jobs, ...reviewable].map(describePlanAiFill)
}

export function describePlanAiFill(job: Job): PlanAiFillRun {
  const payload = Payload.safeParse(job.payload)
  const kept = SoFar.safeParse(job.result)
  const active = (ACTIVE as readonly string[]).includes(job.status)
  const resultStatus = kept.data?.status
  const status: PlanAiFillStatus =
    resultStatus === "applied" || resultStatus === "declined"
      ? resultStatus
      : job.status === "failed" || resultStatus === "failed"
        ? "failed"
        : job.status === "cancelled"
          ? "cancelled"
          : resultStatus === "ready"
            ? "ready"
            : active
              ? "running"
              : job.status === "done"
                ? "ready"
                : "running"

  const suggestions = (kept.data?.suggestions ?? []) as unknown as Suggestion[]
  const slots =
    kept.data?.slots ??
    (payload.data?.slots ?? []).map((s) => ({ date: s.date, meal: s.meal }))

  return {
    id: String(job.id),
    status,
    week: kept.data?.week ?? payload.data?.week ?? null,
    total: kept.data?.total ?? slots.length,
    done: kept.data?.done ?? (status === "ready" ? slots.length : 0),
    phase: (kept.data?.phase as PlanAiFillPhase | null | undefined) ?? null,
    suggestions,
    error:
      kept.data?.error ??
      (job.status === "failed" ? (job.error ?? "Something went wrong.") : null),
    appliedAt: kept.data?.appliedAt ?? null,
    createdAt: job.createdAt.toISOString(),
    finishedAt: job.finishedAt?.toISOString() ?? null,
  }
}

export async function applyPlanAiFill(
  em: EntityManager,
  runId: string,
  householdId: string,
  entries: {
    date: string
    meal: string
    recipe: string
    withRecipe?: string | null
    why?: Suggestion["why"]
  }[]
) {
  const job = await findPlanAiFill(em, runId, householdId)
  const described = describePlanAiFill(job)
  if (described.status === "applied") {
    throw new AppError(
      "invalid",
      "ai_fill_applied",
      "These suggestions were already added to the plan."
    )
  }
  if (described.status === "declined" || described.status === "cancelled") {
    throw new AppError(
      "invalid",
      "ai_fill_closed",
      "This AI fill run is no longer available."
    )
  }
  if (described.status !== "ready") {
    throw new AppError(
      "invalid",
      "ai_fill_not_ready",
      "The AI suggestions are not ready yet."
    )
  }
  if (entries.length === 0) {
    throw new AppError(
      "invalid",
      "no_entries",
      "Choose at least one meal to add."
    )
  }
  const suggestionIds = new Set(
    described.suggestions.map((s) => `${s.date}:${s.meal}:${s.recipe.id}`)
  )
  for (const entry of entries) {
    if (!suggestionIds.has(`${entry.date}:${entry.meal}:${entry.recipe}`)) {
      throw new AppError(
        "invalid",
        "ai_fill_entry_invalid",
        "One of the meals is not part of this AI suggestion."
      )
    }
  }
  const added = await addEntries(em, householdId, entries as never)
  await em.nativeUpdate(
    Job,
    { id: job.id },
    {
      result: {
        ...(job.result ?? {}),
        status: "applied",
        appliedAt: new Date().toISOString(),
      } as Record<string, unknown>,
    }
  )
  return { entries: added }
}

export async function declinePlanAiFill(
  em: EntityManager,
  runId: string,
  householdId: string,
  stopJob: (id: string) => void
) {
  const job = await findPlanAiFill(em, runId, householdId)
  if ((ACTIVE as readonly string[]).includes(job.status)) {
    const { cancelJob } = await import("../jobs/jobs.ts")
    await cancelJob(em, job, stopJob)
    return
  }
  await em.nativeUpdate(
    Job,
    { id: job.id },
    {
      result: {
        ...(job.result ?? {}),
        status: "declined",
      } as Record<string, unknown>,
    }
  )
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size))
  return out
}

export const planAiFillJob: JobHandler = {
  kind: PLAN_AI_FILL_KIND,
  concurrency: 1,
  async run({ em, householdId, payload, progress, signal, deps, jobId }) {
    if (!householdId) throw new Error("AI fill needs a household.")
    const { slots, exclude, userId, week } = Payload.parse(payload)
    const typedSlots = slots as unknown as Slot[]

    const person = userId
      ? await em.findOne(User, userId, { fields: ["preferences"] })
      : null
    const profile = normalizeUserProfile(
      (person?.preferences?.profile as Record<string, unknown> | undefined) ??
        null
    )

    const suggestions: Suggestion[] = []
    const chosenIds: string[] = [...(exclude ?? [])]
    const chunks = chunk(typedSlots, CHUNK_SIZE)
    let done = 0

    const update = async (
      phase:
        "requesting_large_model" | "fallback_small_model" | "merging" | null,
      extra?: Partial<Record<string, unknown>>
    ) => {
      await progress(done, typedSlots.length, {
        week: week ?? null,
        status: "running",
        slots: typedSlots,
        suggestions,
        error: null,
        appliedAt: null,
        phase,
        done,
        total: typedSlots.length,
        ...extra,
      })
    }

    try {
      for (const part of chunks) {
        if (signal.aborted) {
          const { JobStopped } = await import("../jobs/runner.ts")
          throw new JobStopped()
        }
        await update("requesting_large_model")
        const onStatus = async (status: AiSuggestStatus) => {
          await update(status)
        }
        const run = await aiSuggestMeals({ ...deps, logger: deps.logger }, em, {
          householdId,
          userId,
          slots: part,
          exclude: chosenIds,
          profile,
          maxCaloriesPerDay: 2000,
          onStatus,
        })
        suggestions.push(...run)
        chosenIds.push(...run.map((s) => s.recipe.id))
        done += part.length
        await update("merging")
      }

      return {
        week: week ?? null,
        status: "ready",
        slots: typedSlots,
        suggestions,
        error: null,
        appliedAt: null,
        phase: null,
        done: typedSlots.length,
        total: typedSlots.length,
      }
    } catch (error) {
      if (signal.aborted) throw error
      const message =
        error instanceof AppError
          ? error.message
          : "The AI couldn't fill the week. Try again."
      deps.logger?.warn({ err: error, jobId }, "AI fill week job failed")
      // Persist a ready-to-display failure in result; rethrow marks job failed,
      // but we also want the error visible. Store result via progress side-effect
      // is best-effort; the handler return won't run on throw. We'll throw and
      // let describePlanAiFill surface job.error, but also try to save result.
      try {
        await deps.database.em.fork().nativeUpdate(
          Job,
          { id: jobId },
          {
            result: {
              week: week ?? null,
              status: "failed",
              slots: typedSlots,
              suggestions,
              error: message,
              appliedAt: null,
              phase: null,
              done,
              total: typedSlots.length,
            } as Record<string, unknown>,
          }
        )
      } catch {
        // ignore
      }
      throw error instanceof AppError
        ? error
        : new AppError("upstream", "ai_fill_failed", message)
    }
  },
}
