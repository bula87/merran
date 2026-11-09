import { Delete02Icon, Restaurant01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { api, ApiError, unwrap } from "@/lib/api/client"

import { mealLogsQuery, type MealLog } from "./queries"

function nutrientParts(log: MealLog) {
  const parts: string[] = []
  if (log.calories != null) parts.push(`${log.calories} kcal`)
  if (log.protein != null) parts.push(`P ${log.protein}g`)
  if (log.carbs != null) parts.push(`C ${log.carbs}g`)
  if (log.fat != null) parts.push(`F ${log.fat}g`)
  return parts
}

export function MealsPage() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const { data, isPending, isError } = useQuery(mealLogsQuery)

  const remove = useMutation({
    mutationFn: (id: string) =>
      unwrap(
        api.DELETE("/api/meal-logs/{logId}", {
          params: { path: { logId: id } },
        })
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["meal-logs"] })
      toast.success(t("mealsLog.deleted"))
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : t("photo.error"))
    },
  })

  const logs = data?.logs ?? []
  const dateFmt = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "medium",
    timeStyle: "short",
  })

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6">
      <PageHeader
        title={t("mealsLog.title")}
        description={t("mealsLog.description")}
      />

      {isPending ? (
        <div className="flex justify-center py-12 text-muted-foreground">
          <Spinner />
        </div>
      ) : isError ? (
        <p className="py-8 text-sm text-destructive">{t("photo.error")}</p>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
            <HugeiconsIcon icon={Restaurant01Icon} strokeWidth={2} />
          </span>
          <div className="space-y-1">
            <p className="font-medium">{t("mealsLog.emptyTitle")}</p>
            <p className="text-sm text-muted-foreground">
              {t("mealsLog.emptyDescription")}
            </p>
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {logs.map((log) => {
            const nutrients = nutrientParts(log)
            return (
              <li key={log.id}>
                <Card>
                  <CardContent className="flex items-start gap-3 p-4">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="font-medium">{log.name}</p>
                        {log.source === "photo" && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                            {t("mealsLog.fromPhoto")}
                          </span>
                        )}
                        {log.source === "recipe" && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                            {t("mealsLog.fromRecipe")}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {dateFmt.format(new Date(log.loggedAt))}
                        {log.serving ? ` · ${log.serving}` : ""}
                      </p>
                      {nutrients.length > 0 && (
                        <p className="text-sm text-muted-foreground tabular-nums">
                          {nutrients.join(" · ")}
                        </p>
                      )}
                      {log.recipe && (
                        <Link
                          to="/recipes/$slug"
                          params={{ slug: log.recipe.slug }}
                          className="inline-block text-sm text-primary underline-offset-3 hover:underline"
                        >
                          {log.recipe.name}
                        </Link>
                      )}
                      {log.notes && (
                        <p className="text-sm text-muted-foreground">
                          {log.notes}
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("mealsLog.delete")}
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(log.id)}
                    >
                      <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                    </Button>
                  </CardContent>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
