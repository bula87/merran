import { clockIn, plannedMeals, weekStartOf } from "@merran/shared"
import { queryOptions, useQuery } from "@tanstack/react-query"

import { householdQuery } from "@/features/household/queries"
import { api, unwrap, ApiError, type Schemas } from "@/lib/api/client"

export type PlanEntry = Schemas["PlanEntry"]
export type PlanSnapshot = Schemas["PlanEntrySnapshot"]
export type Meal = PlanEntry["meal"]
export type Suggestion = Schemas["Suggestions"]["suggestions"][number]
export type PlanSlot = { date: string; meal: Meal }
export type AiSuggestStatus = "requesting_large_model" | "fallback_small_model"

/** Recipes for a meal or more, saying why. */
export const suggest = (slots: PlanSlot[], exclude: string[] = []) =>
  unwrap(api.POST("/api/plan/suggest", { body: { slots, exclude } }))

/** Recipes for slots, chosen by AI using recipes and your personal profile. Streams status updates. */
export async function suggestAi(
  slots: PlanSlot[],
  exclude: string[] = [],
  onStatus?: (status: AiSuggestStatus) => void
): Promise<Schemas["Suggestions"]> {
  const response = await fetch("/api/plan/suggest/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ slots, exclude }),
  })

  if (!response.ok) {
    let body: {
      error?: {
        code?: string
        message?: string
        fields?: Record<string, string>
      }
    } = {}
    try {
      body = (await response.json()) as typeof body
    } catch {
      // ignore
    }
    throw new ApiError(
      response.status,
      body.error?.code ?? "error",
      body.error?.message ?? response.statusText,
      body.error?.fields ?? {}
    )
  }

  if (!response.body) {
    throw new ApiError(500, "upstream", "The AI response stream was empty.")
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let eventName = "message"
  let dataLines: string[] = []

  function dispatch(name: string, data: string): Schemas["Suggestions"] | null {
    if (!data) return null
    let parsed: unknown
    try {
      parsed = JSON.parse(data)
    } catch {
      return null
    }
    if (name === "status") {
      const status = (parsed as { status?: AiSuggestStatus }).status
      if (status) onStatus?.(status)
      return null
    }
    if (name === "result") {
      return parsed as Schemas["Suggestions"]
    }
    if (name === "error") {
      const err = parsed as {
        code?: string
        message?: string
        fields?: Record<string, string>
      }
      throw new ApiError(
        500,
        err.code ?? "upstream",
        err.message ?? "Something went wrong while filling the week with AI.",
        err.fields ?? {}
      )
    }
    return null
  }

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      if (line === "") {
        const result = dispatch(eventName, dataLines.join("\n"))
        eventName = "message"
        dataLines = []
        if (result) return result
        continue
      }
      if (line.startsWith(":")) continue
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim()
        continue
      }
      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).replace(/^ /, ""))
      }
    }
    if (done) {
      if (dataLines.length > 0 || eventName !== "message") {
        const result = dispatch(eventName, dataLines.join("\n"))
        if (result) return result
      }
      break
    }
  }

  throw new ApiError(
    500,
    "upstream",
    "The AI did not return meal suggestions. Try again."
  )
}

/** The plan from one day to another, the week's pool included. */
export const planQuery = (from: string, to: string) =>
  queryOptions({
    queryKey: ["plan", from, to],
    queryFn: () =>
      unwrap(api.GET("/api/plan", { params: { query: { from, to } } })),
  })

/** The weekly autoplan: when it runs, what it fills, its next and last run. */
export const autoplanQuery = queryOptions({
  queryKey: ["plan", "autoplan"],
  queryFn: () => unwrap(api.GET("/api/plan/autoplan")),
})

/** What's next, checked again now and then as the day goes on. */
export const nextMealQuery = queryOptions({
  queryKey: ["plan", "next"],
  queryFn: () => unwrap(api.GET("/api/plan/next")),
  refetchInterval: 5 * 60_000,
})

/**
 * The household's clock: today and the hour in its time zone, its week's
 * first day, and the meals it plans. Today is the household's, so everyone
 * in it sees the same day.
 */
export function useHouseholdClock() {
  const { data: household } = useQuery(householdQuery)
  const timeZone = household?.timeZone ?? "UTC"
  const weekStartsOn = household?.weekStartsOn ?? 1
  const { today, hour } = clockIn(timeZone)
  return {
    today,
    hour,
    weekStartsOn,
    meals: plannedMeals(household?.meals),
    thisWeek: weekStartOf(today, weekStartsOn),
  }
}
