import {
  Add01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Delete02Icon,
  Image01Icon,
  PencilEdit02Icon,
  Restaurant01Icon,
  TextIcon,
  Time02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { api, ApiError, unwrap } from "@/lib/api/client"
import { shrinkPhoto } from "@/lib/shrink-photo"

import { mealLogsQuery, type MealLog } from "./queries"

function nutrientParts(log: MealLog) {
  const parts: string[] = []
  if (log.calories != null) parts.push(`${log.calories} kcal`)
  if (log.protein != null) parts.push(`P ${log.protein}g`)
  if (log.carbs != null) parts.push(`C ${log.carbs}g`)
  if (log.fat != null) parts.push(`F ${log.fat}g`)
  return parts
}

type NutrientForm = {
  name: string
  serving: string
  notes: string
  calories: string
  protein: string
  carbs: string
  fat: string
  fiber: string
  sugar: string
  sodium: string
}

function formFromLog(log: MealLog): NutrientForm {
  const num = (v: number | null) => (v == null ? "" : String(v))
  return {
    name: log.name ?? "",
    serving: log.serving ?? "",
    notes: log.notes ?? "",
    calories: num(log.calories),
    protein: num(log.protein),
    carbs: num(log.carbs),
    fat: num(log.fat),
    fiber: num(log.fiber),
    sugar: num(log.sugar),
    sodium: num(log.sodium),
  }
}

function parseNum(value: string) {
  const t = value.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function AddMealLogDialog() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [open, setOpen] = React.useState(false)
  const [tab, setTab] = React.useState("photo")
  const [text, setText] = React.useState("")
  const [file, setFile] = React.useState<File | null>(null)
  const [preview, setPreview] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const fileInput = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  function reset() {
    setText("")
    if (preview) URL.revokeObjectURL(preview)
    setFile(null)
    setPreview(null)
    setError(null)
    setTab("photo")
  }

  const submit = useMutation({
    mutationFn: async () => {
      if (tab === "text") {
        if (!text.trim()) throw new Error(t("mealsLog.add.describeRequired"))
        return unwrap(
          api.POST("/api/meal-logs/analyze", { body: { text: text.trim() } })
        )
      }
      if (!file) throw new Error(t("mealsLog.add.photoRequired"))
      const blob = await shrinkPhoto(file, 2000)
      const form = new FormData()
      form.append("photo", blob, file.name || "meal.jpg")
      if (text.trim()) form.append("text", text.trim())
      return unwrap(
        api.POST("/api/meal-logs/analyze", {
          body: form as unknown as { photo?: string; text?: string },
        })
      )
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: mealLogsQuery.queryKey })
      toast.success(t("mealsLog.add.submitted"))
      setOpen(false)
      reset()
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : t("photo.error"))
    },
  })

  function pick(next: File | undefined) {
    if (!next) return
    if (preview) URL.revokeObjectURL(preview)
    setFile(next)
    setPreview(URL.createObjectURL(next))
    setError(null)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) reset()
      }}
    >
      <DialogTrigger render={<Button type="button" />}>
        <HugeiconsIcon
          icon={Add01Icon}
          strokeWidth={2}
          data-icon="inline-start"
        />
        {t("mealsLog.add.action")}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("mealsLog.add.title")}</DialogTitle>
          <DialogDescription>{t("mealsLog.add.description")}</DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="photo">
              <HugeiconsIcon
                icon={Image01Icon}
                strokeWidth={2}
                className="size-4"
              />
              {t("mealsLog.add.photoTab")}
            </TabsTrigger>
            <TabsTrigger value="text">
              <HugeiconsIcon
                icon={TextIcon}
                strokeWidth={2}
                className="size-4"
              />
              {t("mealsLog.add.textTab")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="photo" className="space-y-3 pt-2">
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => pick(e.target.files?.[0])}
            />
            {!preview ? (
              <button
                type="button"
                className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-sm text-muted-foreground hover:bg-muted/30"
                onClick={() => fileInput.current?.click()}
              >
                <HugeiconsIcon
                  icon={Image01Icon}
                  strokeWidth={2}
                  className="size-8"
                />
                {t("mealsLog.add.choosePhoto")}
              </button>
            ) : (
              <div className="relative overflow-hidden rounded-xl border bg-muted">
                <img
                  src={preview}
                  alt=""
                  className="max-h-48 w-full object-contain"
                />
                <Button
                  type="button"
                  size="icon-sm"
                  variant="secondary"
                  className="absolute top-2 right-2 rounded-full"
                  onClick={() => {
                    if (preview) URL.revokeObjectURL(preview)
                    setFile(null)
                    setPreview(null)
                  }}
                >
                  <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
                </Button>
              </div>
            )}
            <Field>
              <FieldLabel>{t("mealsLog.add.detailsOptional")}</FieldLabel>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t("mealsLog.add.detailsPlaceholder")}
                rows={2}
              />
            </Field>
          </TabsContent>
          <TabsContent value="text" className="space-y-3 pt-2">
            <Field>
              <FieldLabel>{t("mealsLog.add.describeLabel")}</FieldLabel>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t("mealsLog.add.describePlaceholder")}
                rows={5}
              />
            </Field>
          </TabsContent>
        </Tabs>
        {error && <FieldError>{error}</FieldError>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={submit.isPending}
            onClick={() => {
              setError(null)
              submit.mutate()
            }}
          >
            {submit.isPending && <Spinner data-icon="inline-start" />}
            {submit.isPending
              ? t("mealsLog.add.submitting")
              : t("mealsLog.add.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditApproveDialog({
  log,
  open,
  onOpenChange,
}: {
  log: MealLog
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [form, setForm] = React.useState<NutrientForm>(() => formFromLog(log))
  React.useEffect(() => {
    if (open) setForm(formFromLog(log))
  }, [open, log])

  const save = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST("/api/meal-logs/{logId}/approve", {
          params: { path: { logId: log.id } },
          body: {
            name: form.name.trim() || log.name,
            serving: form.serving.trim() || null,
            notes: form.notes.trim() || null,
            calories: parseNum(form.calories),
            protein: parseNum(form.protein),
            carbs: parseNum(form.carbs),
            fat: parseNum(form.fat),
            fiber: parseNum(form.fiber),
            sugar: parseNum(form.sugar),
            sodium: parseNum(form.sodium),
          },
        } as never)
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: mealLogsQuery.queryKey })
      toast.success(t("mealsLog.approved"))
      onOpenChange(false)
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : t("photo.error"))
    },
  })

  const set =
    (key: keyof NutrientForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("mealsLog.review.editApprove")}</DialogTitle>
          <DialogDescription>
            {t("mealsLog.review.editDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field>
            <FieldLabel>{t("mealsLog.fields.name")}</FieldLabel>
            <Input value={form.name} onChange={set("name")} />
          </Field>
          <Field>
            <FieldLabel>{t("mealsLog.fields.serving")}</FieldLabel>
            <Input value={form.serving} onChange={set("serving")} />
          </Field>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field>
              <FieldLabel>{t("mealsLog.fields.calories")}</FieldLabel>
              <Input
                inputMode="decimal"
                value={form.calories}
                onChange={set("calories")}
              />
            </Field>
            <Field>
              <FieldLabel>{t("mealsLog.fields.protein")}</FieldLabel>
              <Input
                inputMode="decimal"
                value={form.protein}
                onChange={set("protein")}
              />
            </Field>
            <Field>
              <FieldLabel>{t("mealsLog.fields.carbs")}</FieldLabel>
              <Input
                inputMode="decimal"
                value={form.carbs}
                onChange={set("carbs")}
              />
            </Field>
            <Field>
              <FieldLabel>{t("mealsLog.fields.fat")}</FieldLabel>
              <Input
                inputMode="decimal"
                value={form.fat}
                onChange={set("fat")}
              />
            </Field>
            <Field>
              <FieldLabel>{t("mealsLog.fields.fiber")}</FieldLabel>
              <Input
                inputMode="decimal"
                value={form.fiber}
                onChange={set("fiber")}
              />
            </Field>
            <Field>
              <FieldLabel>{t("mealsLog.fields.sugar")}</FieldLabel>
              <Input
                inputMode="decimal"
                value={form.sugar}
                onChange={set("sugar")}
              />
            </Field>
            <Field>
              <FieldLabel>{t("mealsLog.fields.sodium")}</FieldLabel>
              <Input
                inputMode="decimal"
                value={form.sodium}
                onChange={set("sodium")}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel>{t("mealsLog.fields.notes")}</FieldLabel>
            <Textarea value={form.notes} onChange={set("notes")} rows={2} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Spinner data-icon="inline-start" />}
            {t("mealsLog.review.approve")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ReviewCard({ log }: { log: MealLog }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [editOpen, setEditOpen] = React.useState(false)
  const nutrients = nutrientParts(log)

  const approve = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST("/api/meal-logs/{logId}/approve", {
          params: { path: { logId: log.id } },
          body: {},
        } as never)
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: mealLogsQuery.queryKey })
      toast.success(t("mealsLog.approved"))
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : t("photo.error")),
  })

  const decline = useMutation({
    mutationFn: () =>
      unwrap(
        api.DELETE("/api/meal-logs/{logId}", {
          params: { path: { logId: log.id } },
        })
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: mealLogsQuery.queryKey })
      toast.success(t("mealsLog.declined"))
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : t("photo.error")),
  })

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
            {log.status === "processing" ? (
              <Spinner className="size-4" />
            ) : log.status === "failed" ? (
              <HugeiconsIcon
                icon={Cancel01Icon}
                strokeWidth={2}
                className="size-4 text-destructive"
              />
            ) : (
              <HugeiconsIcon
                icon={Time02Icon}
                strokeWidth={2}
                className="size-4"
              />
            )}
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-medium">{log.name}</p>
            <p className="text-xs text-muted-foreground">
              {log.source === "photo"
                ? t("mealsLog.fromPhoto")
                : t("mealsLog.fromText")}
              {log.status === "processing"
                ? ` · ${t("mealsLog.review.processing")}`
                : ""}
              {log.status === "ready" ? ` · ${t("mealsLog.review.ready")}` : ""}
              {log.status === "failed"
                ? ` · ${t("mealsLog.review.failed")}`
                : ""}
            </p>
            {log.inputText && (
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                {log.inputText}
              </p>
            )}
          </div>
        </div>
        {log.hasPhoto && (
          <img
            src={`/api/meal-logs/${log.id}/photo`}
            alt=""
            className="max-h-48 w-full rounded-lg border bg-muted object-contain"
            loading="lazy"
          />
        )}
        {log.status === "failed" && log.error && (
          <FieldError>{log.error}</FieldError>
        )}
        {log.status === "ready" && (
          <>
            {nutrients.length > 0 && (
              <p className="text-sm text-muted-foreground tabular-nums">
                {nutrients.join(" · ")}
                {log.confidence
                  ? ` · ${t(`photo.analyze.confidence.${log.confidence}`)}`
                  : ""}
              </p>
            )}
            {log.notes && (
              <p className="text-sm text-muted-foreground">{log.notes}</p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                size="sm"
                disabled={approve.isPending}
                onClick={() => approve.mutate()}
              >
                {approve.isPending ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <HugeiconsIcon
                    icon={CheckmarkCircle02Icon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                )}
                {t("mealsLog.review.approve")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditOpen(true)}
              >
                <HugeiconsIcon
                  icon={PencilEdit02Icon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                {t("mealsLog.review.editApprove")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={decline.isPending}
                onClick={() => decline.mutate()}
              >
                {t("mealsLog.review.decline")}
              </Button>
            </div>
          </>
        )}
        {log.status === "failed" && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              size="sm"
              variant="ghost"
              disabled={decline.isPending}
              onClick={() => decline.mutate()}
            >
              {t("mealsLog.review.decline")}
            </Button>
          </div>
        )}
        {log.status === "processing" && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              size="sm"
              variant="ghost"
              disabled={decline.isPending}
              onClick={() => decline.mutate()}
            >
              {t("common.cancel")}
            </Button>
          </div>
        )}
      </CardContent>
      <EditApproveDialog log={log} open={editOpen} onOpenChange={setEditOpen} />
    </Card>
  )
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
      await queryClient.invalidateQueries({ queryKey: mealLogsQuery.queryKey })
      toast.success(t("mealsLog.deleted"))
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : t("photo.error"))
    },
  })

  const logs = data?.logs ?? []
  const review = logs.filter((l) => l.status !== "logged")
  const logged = logs.filter((l) => l.status === "logged")
  const dateFmt = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "medium",
    timeStyle: "short",
  })

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-6 md:px-6">
      <div className="flex items-start justify-between gap-3">
        <PageHeader
          title={t("mealsLog.title")}
          description={t("mealsLog.description")}
        />
        <AddMealLogDialog />
      </div>

      {isPending ? (
        <div className="flex justify-center py-12 text-muted-foreground">
          <Spinner />
        </div>
      ) : isError ? (
        <p className="py-8 text-sm text-destructive">{t("photo.error")}</p>
      ) : (
        <>
          {review.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground">
                {t("mealsLog.review.title")}
              </h2>
              <ul className="space-y-3">
                {review.map((log) => (
                  <li key={log.id}>
                    <ReviewCard log={log} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {logged.length === 0 && review.length === 0 ? (
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
          ) : logged.length > 0 ? (
            <section className="space-y-3">
              {review.length > 0 && (
                <h2 className="text-sm font-medium text-muted-foreground">
                  {t("mealsLog.logged")}
                </h2>
              )}
              <ul className="space-y-3">
                {logged.map((log) => {
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
                              {log.source === "text" && (
                                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                                  {t("mealsLog.fromText")}
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
                            <HugeiconsIcon
                              icon={Delete02Icon}
                              strokeWidth={2}
                            />
                          </Button>
                        </CardContent>
                      </Card>
                    </li>
                  )
                })}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  )
}
