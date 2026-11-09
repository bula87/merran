import {
  addDays,
  clockIn,
  dayOfWeek,
  NO_THEMES,
  themeLabel,
  type Meal,
  type NightTheme,
} from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import {
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  generateText,
  Output,
} from "ai"
import { z } from "zod"

import { AppError } from "../../core/errors.ts"
import { Household } from "../../database/entities/index.ts"
import type { UserProfile } from "../../http/schemas/user-profile.ts"
import { resolveTask } from "../ai/status.ts"
import { useAi, type AiDeps } from "../ai/run.ts"
import {
  rankCandidates,
  type RankedCandidate,
  type Slot,
  type Suggestion,
} from "./suggest.ts"

// AI Fill the week: algorithmic candidates (tastes, pantry, themes, budget
// signals, recency) narrowed to a small set per slot, then AI picks the
// best fit for the user's profile and day-level calorie target. Day by day,
// one AI request at a time, with a small prompt.

const AiPick = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  meal: z.enum([
    "breakfast",
    "morning-snack",
    "lunch",
    "afternoon-snack",
    "dinner",
  ]),
  recipeId: z.string().min(1),
})

const AiPlan = z.object({
  suggestions: z.array(AiPick).max(12),
})

export type AiSuggestStatus = "requesting_large_model" | "fallback_small_model"

const LARGE_MODEL_TIMEOUT_MS = 6 * 60 * 1000
const SMALL_MODEL_TIMEOUT_MS = 3 * 60 * 1000
const CANDIDATES_PER_SLOT = 10

function isTimeoutError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === "TimeoutError") ||
    (error instanceof Error && error.name === "TimeoutError")
  )
}

function friendlyError(error: unknown): never {
  if (error instanceof AppError) throw error
  if (
    NoOutputGeneratedError.isInstance(error) ||
    NoObjectGeneratedError.isInstance(error)
  ) {
    throw new AppError(
      "upstream",
      "ai_answer_unreadable",
      "The AI's answer couldn't be read. Try again, or pick another model in Settings, Household, AI."
    )
  }
  throw error
}

function parsePlanText(text: string): z.infer<typeof AiPlan> | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidates = [
    fenced?.[1]?.trim(),
    trimmed,
    trimmed.match(/\{[\s\S]*\}/)?.[0],
  ].filter((value): value is string => !!value)
  for (const candidate of candidates) {
    try {
      const parsed = AiPlan.safeParse(JSON.parse(candidate))
      if (parsed.success) return parsed.data
    } catch {
      // try the next candidate
    }
  }
  return null
}

function salvagePlan(result: unknown): z.infer<typeof AiPlan> | null {
  if (!result || typeof result !== "object") return null
  const r = result as Record<string, unknown>
  for (const key of ["text", "reasoningText"] as const) {
    const value = r[key]
    if (typeof value === "string") {
      const parsed = parsePlanText(value)
      if (parsed) return parsed
    }
  }
  const response = r.response
  if (response && typeof response === "object") {
    const body = (response as Record<string, unknown>).body
    if (body && typeof body === "object") {
      const choices = (body as Record<string, unknown>).choices
      if (Array.isArray(choices)) {
        for (const choice of choices) {
          if (!choice || typeof choice !== "object") continue
          const message = (choice as Record<string, unknown>).message
          if (!message || typeof message !== "object") continue
          const msg = message as Record<string, unknown>
          for (const key of ["content", "reasoning_content"] as const) {
            const value = msg[key]
            if (typeof value === "string") {
              const parsed = parsePlanText(value)
              if (parsed) return parsed
            }
          }
        }
      }
    }
  }
  return null
}

function themeOf(
  slot: Slot,
  themes: Partial<Record<number, NightTheme | null>>
): NightTheme | null {
  return slot.meal === "dinner" ? (themes[dayOfWeek(slot.date)] ?? null) : null
}

function byDate(slots: readonly Slot[]) {
  const out = new Map<string, Slot[]>()
  for (const slot of slots) {
    const list = out.get(slot.date)
    if (list) list.push(slot)
    else out.set(slot.date, [{ ...slot }])
  }
  return [...out.entries()].sort(([a], [b]) => a.localeCompare(b))
}

type SlotCandidates = { slot: Slot; candidates: RankedCandidate[] }

export async function aiSuggestMeals(
  deps: AiDeps,
  em: EntityManager,
  options: {
    householdId: string
    userId: string | null
    slots: readonly Slot[]
    exclude?: readonly string[]
    profile: UserProfile
    /** Maximum calories per day (guidance). */
    maxCaloriesPerDay?: number
    /** Progress updates for long-running AI requests (e.g. model fallback). */
    onStatus?: (status: AiSuggestStatus) => void | Promise<void>
    /** Slots completed, for background job progress. */
    onProgress?: (done: number, total: number) => void | Promise<void>
    /** Cancel in-flight AI work, e.g. when a background job is stopped. */
    signal?: AbortSignal
  }
): Promise<Suggestion[]> {
  if (options.slots.length === 0) return []
  const maxCaloriesPerDay = options.maxCaloriesPerDay ?? 2000
  const household = await em.findOne(Household, { id: options.householdId })
  const themes = household?.settings?.themes ?? NO_THEMES
  const exclude = [...(options.exclude ?? [])]
  const chosen: Suggestion[] = []
  let done = 0

  for (const [date, daySlots] of byDate(options.slots)) {
    if (options.signal?.aborted)
      throw options.signal.reason ?? new Error("Aborted")

    const ranked = await rankCandidates(em, options.householdId, daySlots, {
      exclude,
      limit: CANDIDATES_PER_SLOT,
    })

    const slotCandidates: SlotCandidates[] = daySlots.map((slot) => ({
      slot,
      candidates: ranked.get(`${slot.date}:${slot.meal}`) ?? [],
    }))
    if (slotCandidates.every((s) => s.candidates.length === 0)) {
      done += daySlots.length
      await options.onProgress?.(done, options.slots.length)
      continue
    }

    const daySuggestions = await chooseForDay(deps, em, {
      householdId: options.householdId,
      userId: options.userId,
      date,
      maxCaloriesPerDay,
      profile: options.profile,
      themes,
      slotCandidates,
      onStatus: options.onStatus,
      signal: options.signal,
    })

    for (const suggestion of daySuggestions) {
      chosen.push(suggestion)
      exclude.push(suggestion.recipe.id)
    }
    done += daySlots.length
    await options.onProgress?.(done, options.slots.length)
  }

  return chosen
}

async function chooseForDay(
  deps: AiDeps,
  em: EntityManager,
  options: {
    householdId: string
    userId: string | null
    date: string
    maxCaloriesPerDay: number
    profile: UserProfile
    themes: Partial<Record<number, NightTheme | null>>
    slotCandidates: SlotCandidates[]
    onStatus?: (status: AiSuggestStatus) => void | Promise<void>
    signal?: AbortSignal
  }
): Promise<Suggestion[]> {
  const pickable = options.slotCandidates.filter((s) => s.candidates.length > 0)
  if (pickable.length === 0) return []

  const candidateById = new Map<string, RankedCandidate>()
  for (const { candidates } of pickable)
    for (const c of candidates) candidateById.set(c.id, c)

  const system = `Choose meals for one day from the pre-filtered candidates provided for each slot. Candidates already respect household tastes, diets, theme nights, and recently used meals. Pick exactly one recipeId per slot that has candidates, using only IDs from that slot's candidates. Consider the user's profile (allergies, dislikes, favorites, goal, cooking devices) and aim for about ${options.maxCaloriesPerDay} kcal total for the day when calories are known. Return only a single JSON object, with no reasoning, no explanation, and no markdown fences: {"suggestions":[{"date":"YYYY-MM-DD","meal":"breakfast|morning-snack|lunch|afternoon-snack|dinner","recipeId":"..."}]}.`

  const prompt = JSON.stringify({
    date: options.date,
    day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
      dayOfWeek(options.date)
    ],
    maxCaloriesPerDay: options.maxCaloriesPerDay,
    userProfile: {
      goal: options.profile.goal,
      allergies: options.profile.allergies,
      favoriteFoods: options.profile.favoriteFoods,
      dislikedFoods: options.profile.dislikedFoods,
      mealsPerDay: options.profile.mealsPerDay,
      cookingDevices: options.profile.cookingDevices,
    },
    slots: pickable.map(({ slot, candidates }) => ({
      date: slot.date,
      meal: slot.meal,
      theme:
        themeOf(slot, options.themes) &&
        themeOf(slot, options.themes)!.kind !== "skip"
          ? themeLabel(themeOf(slot, options.themes)!)
          : themeOf(slot, options.themes)?.kind === "skip"
            ? "skip"
            : null,
      candidates: candidates.map((c) => ({
        id: c.id,
        name: c.name,
        cal: c.calories,
        p: c.protein,
        c: c.carbs,
        f: c.fat,
        min: c.totalMinutes,
        tags: c.tags,
        why: c.why.map((r) => ("label" in r ? `${r.kind}:${r.label}` : r.kind)),
      })),
    })),
  })

  async function run(modelRef: string | undefined, timeoutMs: number) {
    const timeout = AbortSignal.timeout(timeoutMs)
    const signal = options.signal
      ? AbortSignal.any([timeout, options.signal])
      : timeout
    const r = await useAi(
      deps,
      em,
      {
        householdId: options.householdId,
        userId: options.userId,
        task: "plan",
        needs: ["structured"],
        modelRef,
        aiLog: {
          input: {
            date: options.date,
            slotCount: pickable.length,
            candidateCount: pickable.reduce(
              (n, s) => n + s.candidates.length,
              0
            ),
          },
          rawRequest: { system, prompt },
        },
      },
      (model, extras) => {
        const nemotron = /nemotron/i.test(extras.target.model)
        return generateText({
          model,
          system,
          prompt,
          output: Output.object({
            schema: AiPlan,
            name: "meal_plan_suggestions",
          }),
          maxOutputTokens: 4000,
          temperature: 0,
          abortSignal: signal,
          ...(nemotron
            ? {
                providerOptions: {
                  address: {
                    chat_template_kwargs: { enable_thinking: false },
                  },
                  openaiCompatible: {
                    chat_template_kwargs: { enable_thinking: false },
                  },
                },
              }
            : {}),
        })
      }
    )
    try {
      return r.output
    } catch (error) {
      if (
        NoOutputGeneratedError.isInstance(error) ||
        NoObjectGeneratedError.isInstance(error)
      ) {
        const salvaged = salvagePlan(r)
        if (salvaged) return salvaged
      }
      throw error
    }
  }

  function shouldFallback(error: unknown) {
    if (!(error instanceof AppError)) return true
    return ![
      "ai_noKey",
      "ai_notCovered",
      "ai_overLimit",
      "ai_ownLimit",
    ].includes(error.code)
  }

  let output: z.infer<typeof AiPlan>
  const onStatus = options.onStatus
  try {
    if (options.signal?.aborted)
      throw options.signal.reason ?? new Error("Aborted")
    await onStatus?.("requesting_large_model")
    output = await run(undefined, LARGE_MODEL_TIMEOUT_MS)
  } catch (error) {
    if (options.signal?.aborted) throw error
    if (!shouldFallback(error)) throw error
    deps.logger?.warn(
      {
        err: error,
        task: "plan",
        date: options.date,
        timeout: isTimeoutError(error),
        model: "large",
      },
      isTimeoutError(error)
        ? "AI plan timed out, trying small model"
        : "AI plan failed, trying small model"
    )
    await onStatus?.("fallback_small_model")
    try {
      if (options.signal?.aborted)
        throw options.signal.reason ?? new Error("Aborted")
      const small = await resolveTask(deps, em, options.householdId, "swaps", 0)
      if (small.ok) {
        output = await run(small.ref, SMALL_MODEL_TIMEOUT_MS)
      } else {
        friendlyError(error)
      }
    } catch (fallbackError) {
      if (options.signal?.aborted) throw fallbackError
      if (isTimeoutError(error) && isTimeoutError(fallbackError)) {
        throw new AppError(
          "upstream",
          "ai_timeout",
          "The AI took too long to fill the week. Try again, or fill fewer meals."
        )
      }
      if (isTimeoutError(fallbackError)) {
        throw new AppError(
          "upstream",
          "ai_timeout",
          "The AI took too long to fill the week. Try again, or fill fewer meals."
        )
      }
      if (shouldFallback(fallbackError) && fallbackError !== error) {
        deps.logger?.warn(
          { err: fallbackError, task: "plan", date: options.date },
          "AI plan fallback failed"
        )
      }
      friendlyError(fallbackError)
    }
  }

  const allowedBySlot = new Map(
    pickable.map(({ slot, candidates }) => [
      `${slot.date}:${slot.meal}`,
      new Set(candidates.map((c) => c.id)),
    ])
  )
  const chosenBySlot = new Map<string, string>()
  for (const pick of output.suggestions) {
    const key = `${pick.date}:${pick.meal}`
    if (chosenBySlot.has(key)) continue
    const allowed = allowedBySlot.get(key)
    if (!allowed?.has(pick.recipeId)) continue
    chosenBySlot.set(key, pick.recipeId)
  }

  return pickable.flatMap(({ slot }) => {
    const id = chosenBySlot.get(`${slot.date}:${slot.meal}`)
    const recipe = id ? candidateById.get(id) : undefined
    if (!recipe) return []
    return [
      {
        ...slot,
        recipe: {
          id: recipe.id,
          slug: recipe.slug,
          name: recipe.name,
          photo: recipe.photo,
          servings: recipe.servings,
          totalMinutes: recipe.totalMinutes,
        },
        withRecipe: null,
        why: recipe.why,
      } satisfies Suggestion,
    ]
  })
}
