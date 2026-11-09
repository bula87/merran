import { CookingPotIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { formatMinutes } from "@/features/recipes/format"
import { useRefreshRecipes } from "@/features/recipes/queries"
import { ApiError } from "@/lib/api/client"

import {
  applyPlanAiFill,
  declinePlanAiFill,
  type PlanAiFillRun,
  type PlanAiFillSuggestion,
} from "./ai-fill"
import { formatWeekday } from "./format"
import { splitWhy, useWhyText } from "./why"

function keyOf(s: PlanAiFillSuggestion) {
  return `${s.date}:${s.meal}:${s.recipe.id}`
}

export function AiFillReviewDialog({
  run,
  onOpenChange,
}: {
  run: PlanAiFillRun | null
  onOpenChange: (open: boolean) => void
}) {
  const { t, i18n } = useTranslation()
  const whyText = useWhyText()
  const queryClient = useQueryClient()
  const refreshRecipes = useRefreshRecipes()
  const [selected, setSelected] = React.useState<Record<string, boolean>>({})
  const [working, setWorking] = React.useState<"apply" | "decline" | null>(null)

  React.useEffect(() => {
    if (!run) return
    setSelected(
      Object.fromEntries(run.suggestions.map((s) => [keyOf(s), true]))
    )
  }, [run?.id])

  const suggestions = run?.suggestions ?? []
  const chosen = suggestions.filter((s) => selected[keyOf(s)])
  const when = (s: PlanAiFillSuggestion) =>
    `${formatWeekday(s.date, i18n.language)} · ${t(`plan.meals.${s.meal}`)}`

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["plan-ai-fill"] }),
      queryClient.invalidateQueries({ queryKey: ["plan"] }),
      refreshRecipes(),
    ])
  }

  async function decline() {
    if (!run) return
    setWorking("decline")
    try {
      await declinePlanAiFill(run.id)
      await refresh()
      onOpenChange(false)
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setWorking(null)
    }
  }

  async function apply() {
    if (!run || chosen.length === 0) return
    setWorking("apply")
    try {
      await applyPlanAiFill(run.id, {
        entries: chosen.map((s) => ({
          date: s.date,
          meal: s.meal,
          recipe: s.recipe.id,
          withRecipe: s.withRecipe?.id ?? null,
          why: s.why,
        })),
      })
      toast.success(
        t("plan.aiFill.applied", {
          count: chosen.length,
          defaultValue: "Added {{count}} meals to your plan.",
        })
      )
      await refresh()
      onOpenChange(false)
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setWorking(null)
    }
  }

  return (
    <Dialog open={!!run} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {t("plan.aiFill.reviewTitle", "Review AI plan")}
          </DialogTitle>
          <DialogDescription>
            {run?.status === "failed"
              ? (run.error ??
                t("plan.aiFill.failed", "AI couldn't fill the week."))
              : t(
                  "plan.aiFill.reviewDescription",
                  "Check the meals AI picked for your week. Uncheck anything you don't want, then accept or decline."
                )}
          </DialogDescription>
        </DialogHeader>

        {run?.status === "failed" ? null : (
          <ul className="-mx-1 grid max-h-[55vh] gap-1 overflow-y-auto px-1">
            {suggestions.map((s) => {
              const key = keyOf(s)
              const checked = !!selected[key]
              const reason = splitWhy(s.why)
              return (
                <li key={key} className="flex items-start gap-3 py-1.5">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(value) =>
                      setSelected((current) => ({ ...current, [key]: !!value }))
                    }
                    aria-label={t("plan.aiFill.include", {
                      when: when(s),
                      defaultValue: "Include {{when}}",
                    })}
                    className="mt-3"
                  />
                  {s.recipe.photo ? (
                    <img
                      src={s.recipe.photo}
                      alt=""
                      className="size-11 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <HugeiconsIcon
                        icon={CookingPotIcon}
                        strokeWidth={2}
                        className="size-5"
                      />
                    </span>
                  )}
                  <div className="grid min-w-0 flex-1">
                    <span className="truncate text-xs text-muted-foreground">
                      {when(s)}
                    </span>
                    <span className="truncate font-medium">
                      {s.recipe.name}
                      {s.withRecipe && (
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          {t("plan.withName", { name: s.withRecipe.name })}
                        </span>
                      )}
                    </span>
                    {reason.reasons.length > 0 ? (
                      <span className="truncate text-xs font-medium text-primary">
                        {whyText(reason.reasons)}
                      </span>
                    ) : (
                      s.recipe.totalMinutes != null && (
                        <span className="text-xs text-muted-foreground">
                          {formatMinutes(t, s.recipe.totalMinutes)}
                        </span>
                      )
                    )}
                    {reason.leaveOut.length > 0 && (
                      <span className="truncate text-xs text-muted-foreground">
                        {whyText(reason.leaveOut)}
                      </span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        <DialogFooter>
          <Button
            variant="ghost"
            disabled={working !== null}
            onClick={() => void decline()}
          >
            {working === "decline" && <Spinner data-icon="inline-start" />}
            {run?.status === "failed"
              ? t("plan.aiFill.dismiss", "Dismiss")
              : t("plan.aiFill.decline", "Decline")}
          </Button>
          {run?.status !== "failed" && (
            <Button
              disabled={working !== null || chosen.length === 0}
              onClick={() => void apply()}
            >
              {working === "apply" && <Spinner data-icon="inline-start" />}
              {t("plan.aiFill.accept", {
                count: chosen.length,
                defaultValue: "Accept {{count}} meals",
              })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
