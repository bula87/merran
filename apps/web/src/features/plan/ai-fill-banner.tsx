import { useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

import {
  activePlanAiFillsQuery,
  isAiFillActive,
  isAiFillReviewable,
  type PlanAiFillRun,
} from "./ai-fill"
import { AiFillReviewDialog } from "./ai-fill-review-dialog"

/** On Plan, while AI is filling the week or when suggestions are ready to review. */
export function AiFillBanner() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data } = useQuery(activePlanAiFillsQuery)
  const runs = data?.runs ?? []
  const [reviewing, setReviewing] = React.useState<PlanAiFillRun | null>(null)

  const active = runs.find(isAiFillActive)
  const reviewable = runs.find(isAiFillReviewable)
  const failed = runs.find((run) => run.status === "failed")
  const run = active ?? reviewable ?? failed
  const runId = run?.id

  const before = React.useRef<string | undefined>(undefined)
  React.useEffect(() => {
    if (before.current && before.current !== runId) {
      void queryClient.invalidateQueries({ queryKey: ["plan"] })
    }
    before.current = runId
  }, [runId, queryClient])

  if (!run) return null

  if (run.status === "running") {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-sm">
        <Spinner />
        <span className="min-w-0 flex-1" aria-live="polite">
          {run.phase === "fallback_small_model"
            ? t(
                "plan.aiFill.banner.fallback",
                "AI is working (using backup model)…"
              )
            : t("plan.aiFill.banner.working", "AI is filling your week…")}
          {run.total > 0
            ? ` ${t("plan.aiFill.banner.progress", {
                done: run.done,
                total: run.total,
                defaultValue: "{{done}}/{{total}} meals",
              })}`
            : ""}
        </span>
      </div>
    )
  }

  if (run.status === "ready") {
    return (
      <>
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-sm">
          <span className="min-w-0 flex-1" aria-live="polite">
            {t(
              "plan.aiFill.banner.ready",
              "Your AI meal plan is ready to review."
            )}
          </span>
          <Button size="sm" onClick={() => setReviewing(run)}>
            {t("plan.aiFill.review", "Review")}
          </Button>
        </div>
        <AiFillReviewDialog
          run={reviewing?.id === run.id ? run : reviewing}
          onOpenChange={(open) => {
            if (!open) setReviewing(null)
          }}
        />
      </>
    )
  }

  if (run.status === "failed") {
    return (
      <>
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-destructive/30 bg-card px-4 py-3 text-sm">
          <span className="min-w-0 flex-1" aria-live="polite">
            {run.error ?? t("plan.aiFill.failed", "AI couldn't fill the week.")}
          </span>
          <Button variant="outline" size="sm" onClick={() => setReviewing(run)}>
            {t("plan.aiFill.dismiss", "Dismiss")}
          </Button>
        </div>
        <AiFillReviewDialog
          run={reviewing?.id === run.id ? run : reviewing}
          onOpenChange={(open) => {
            if (!open) setReviewing(null)
          }}
        />
      </>
    )
  }

  return null
}
