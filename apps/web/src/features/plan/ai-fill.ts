import { queryOptions } from "@tanstack/react-query"

import { api, unwrap, type Schemas } from "@/lib/api/client"

export type PlanAiFillRun = Schemas["AiFillRun"]
export type PlanAiFillSuggestion = PlanAiFillRun["suggestions"][number]

export const isAiFillActive = (run: Pick<PlanAiFillRun, "status">) =>
  run.status === "running"

export const isAiFillReviewable = (run: Pick<PlanAiFillRun, "status">) =>
  run.status === "ready"

/** One AI fill run, polled while it's working. */
export const planAiFillQuery = (runId: string) =>
  queryOptions({
    queryKey: ["plan-ai-fill", runId],
    queryFn: () =>
      unwrap(
        api.GET("/api/plan/ai-fill/{runId}", {
          params: { path: { runId } },
        })
      ),
    refetchInterval: (query) =>
      query.state.data && isAiFillActive(query.state.data) ? 1500 : false,
  })

/** Active and reviewable AI fill runs for the household. */
export const activePlanAiFillsQuery = queryOptions({
  queryKey: ["plan-ai-fill", "active"],
  queryFn: () => unwrap(api.GET("/api/plan/ai-fill")),
  refetchInterval: (query) =>
    query.state.data?.runs.some(isAiFillActive) ? 2000 : false,
})

export async function startPlanAiFill(body: Schemas["AiFillStart"]) {
  return unwrap(api.POST("/api/plan/ai-fill", { body }))
}

export async function applyPlanAiFill(
  runId: string,
  body: Schemas["AiFillApply"]
) {
  return unwrap(
    api.POST("/api/plan/ai-fill/{runId}/apply", {
      params: { path: { runId } },
      body,
    })
  )
}

export async function declinePlanAiFill(runId: string) {
  return unwrap(
    api.POST("/api/plan/ai-fill/{runId}/decline", {
      params: { path: { runId } },
    })
  )
}
