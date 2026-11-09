import {
  Camera01Icon,
  Cancel01Icon,
  ChartHistogramIcon,
  CookBookIcon,
  Image01Icon,
  NoteAddIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldError } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { useCanTakePhoto } from "@/features/assistant/attachments"
import { NeedsAi, useAiFor } from "@/features/ai/needs-ai"
import { mealLogsQuery } from "@/features/meals/queries"
import { ApiError, api, unwrap } from "@/lib/api/client"
import { shrinkPhoto } from "@/lib/shrink-photo"

export const Route = createFileRoute("/_app/photo")({
  component: PhotoPage,
})

const MAX_SIDE = 2000
const PHOTO_JOB_KEY = "merran:meal-photo-job"

function readStoredJobId() {
  try {
    return localStorage.getItem(PHOTO_JOB_KEY)
  } catch {
    return null
  }
}

function storeJobId(jobId: string | null) {
  try {
    if (jobId) localStorage.setItem(PHOTO_JOB_KEY, jobId)
    else localStorage.removeItem(PHOTO_JOB_KEY)
  } catch {
    // Ignore storage failures.
  }
}

type Analysis = {
  name: string | null
  description: string | null
  serving: string | null
  confidence: "low" | "medium" | "high" | null
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
  fiber?: number
  sugar?: number
  sodium?: number
  notes: string | null
}

function PhotoPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const importAi = useAiFor("import")
  const nutritionAi = useAiFor("nutrition")
  const canTakePhoto = useCanTakePhoto()
  const fileInput = React.useRef<HTMLInputElement>(null)
  const cameraInput = React.useRef<HTMLInputElement>(null)

  const [file, setFile] = React.useState<File | null>(null)
  const [preview, setPreview] = React.useState<string | null>(null)
  const [recipeBusy, setRecipeBusy] = React.useState(false)
  const [recipeError, setRecipeError] = React.useState<string | null>(null)
  const [jobId, setJobId] = React.useState<string | null>(() =>
    readStoredJobId()
  )
  const [submitBusy, setSubmitBusy] = React.useState(false)
  const [analyzeError, setAnalyzeError] = React.useState<string | null>(null)
  const [analysis, setAnalysis] = React.useState<Analysis | null>(null)
  const [logOpen, setLogOpen] = React.useState(false)

  const addLog = useMutation({
    mutationFn: (value: Analysis) =>
      unwrap(
        api.POST("/api/meal-logs", {
          body: {
            name: value.name || t("photo.analyze.result"),
            serving: value.serving,
            source: "photo",
            confidence: value.confidence,
            notes: value.notes,
            calories: value.calories ?? null,
            protein: value.protein ?? null,
            carbs: value.carbs ?? null,
            fat: value.fat ?? null,
            fiber: value.fiber ?? null,
            sugar: value.sugar ?? null,
            sodium: value.sodium ?? null,
          },
        })
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: mealLogsQuery.queryKey })
      setLogOpen(false)
      toast.success(t("photo.log.added"))
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : t("photo.error"))
    },
  })

  React.useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  function clearJob() {
    storeJobId(null)
    setJobId(null)
  }

  function clearResult() {
    setRecipeError(null)
    setAnalyzeError(null)
    setAnalysis(null)
    setLogOpen(false)
    clearJob()
  }

  const jobQuery = useQuery({
    queryKey: ["meal-photo-analysis", jobId],
    enabled: !!jobId,
    queryFn: () =>
      unwrap(
        api.GET("/api/nutrition/photo/{jobId}", {
          params: { path: { jobId: jobId! } },
        })
      ),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === "queued" || status === "running" ? 2000 : false
    },
    retry: false,
  })

  React.useEffect(() => {
    const job = jobQuery.data
    if (!job || !jobId) return
    if (job.status === "done" && job.analysis) {
      setAnalysis(job.analysis as Analysis)
      setAnalyzeError(null)
      setLogOpen(true)
      clearJob()
    } else if (job.status === "failed" || job.status === "cancelled") {
      setAnalyzeError(job.error || t("photo.error"))
      clearJob()
    }
  }, [jobQuery.data, jobId, t])

  React.useEffect(() => {
    if (!jobQuery.error || !jobId) return
    setAnalyzeError(
      jobQuery.error instanceof ApiError
        ? jobQuery.error.message
        : t("photo.error")
    )
    clearJob()
  }, [jobQuery.error, jobId, t])

  const analyzeBusy =
    submitBusy ||
    jobQuery.data?.status === "queued" ||
    jobQuery.data?.status === "running" ||
    (!!jobId && jobQuery.isPending)

  function pick(next: File | undefined) {
    if (!next) return
    clearResult()
    if (preview) URL.revokeObjectURL(preview)
    setFile(next)
    setPreview(URL.createObjectURL(next))
  }

  function remove() {
    clearResult()
    if (preview) URL.revokeObjectURL(preview)
    setFile(null)
    setPreview(null)
  }

  function openCamera() {
    if (canTakePhoto === "phone") cameraInput.current?.click()
    else fileInput.current?.click()
  }

  async function addAsRecipe() {
    if (!file) {
      setRecipeError(t("photo.noPhoto"))
      return
    }
    setRecipeBusy(true)
    setRecipeError(null)
    setLogOpen(false)
    try {
      const blob = await shrinkPhoto(file, MAX_SIDE)
      const form = new FormData()
      form.append("photos", blob, file.name || "photo.jpg")
      const recipe = await unwrap(
        api.POST("/api/recipes/import/photos", {
          body: form as unknown as { photos?: string[] },
        })
      )
      await navigate({ to: "/recipes/$slug", params: { slug: recipe.slug } })
    } catch (err) {
      setRecipeError(err instanceof ApiError ? err.message : t("photo.error"))
    } finally {
      setRecipeBusy(false)
    }
  }

  async function analyzeMeal() {
    if (!file) {
      setAnalyzeError(t("photo.noPhoto"))
      return
    }
    setSubmitBusy(true)
    setAnalyzeError(null)
    setAnalysis(null)
    setLogOpen(false)
    storeJobId(null)
    setJobId(null)
    try {
      const blob = await shrinkPhoto(file, MAX_SIDE)
      const form = new FormData()
      form.append("photo", blob, file.name || "meal.jpg")
      const data = await unwrap(
        api.POST("/api/nutrition/photo", {
          body: form as unknown as { photo?: string },
        })
      )
      const nextJobId = (data as { jobId?: string }).jobId
      if (!nextJobId) throw new Error(t("photo.error"))
      storeJobId(nextJobId)
      setJobId(nextJobId)
    } catch (err) {
      setAnalyzeError(err instanceof ApiError ? err.message : t("photo.error"))
    } finally {
      setSubmitBusy(false)
    }
  }

  function openLog() {
    if (analysis) setLogOpen(true)
    else setAnalyzeError(t("photo.log.analyzeFirst"))
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6">
      <PageHeader
        title={t("photo.title")}
        description={t("photo.description")}
      />

      <div className="space-y-6">
        <Card>
          <CardContent className="pt-6">
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => pick(e.target.files?.[0])}
            />
            {canTakePhoto && (
              <input
                ref={cameraInput}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => pick(e.target.files?.[0])}
              />
            )}
            {!preview ? (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center">
                <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
                  <HugeiconsIcon icon={Image01Icon} strokeWidth={2} />
                </span>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInput.current?.click()}
                  >
                    <HugeiconsIcon
                      icon={Image01Icon}
                      strokeWidth={2}
                      data-icon="inline-start"
                    />
                    {t("photo.choose")}
                  </Button>
                  <Button type="button" onClick={openCamera}>
                    <HugeiconsIcon
                      icon={Camera01Icon}
                      strokeWidth={2}
                      data-icon="inline-start"
                    />
                    {t("photo.camera")}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="relative overflow-hidden rounded-xl border bg-muted">
                  <img
                    src={preview}
                    alt={t("photo.preview")}
                    className="max-h-[420px] w-full object-contain"
                  />
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="secondary"
                    className="absolute top-2 right-2 rounded-full"
                    aria-label={t("photo.remove")}
                    onClick={remove}
                  >
                    <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => fileInput.current?.click()}
                >
                  {t("photo.change")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HugeiconsIcon
                  icon={CookBookIcon}
                  strokeWidth={2}
                  className="size-5"
                />
                {t("photo.addRecipe.title")}
              </CardTitle>
              <CardDescription>
                {t("photo.addRecipe.description")}
              </CardDescription>
              <CardAction>
                <Button
                  type="button"
                  disabled={!file || recipeBusy}
                  onClick={addAsRecipe}
                >
                  {recipeBusy && <Spinner data-icon="inline-start" />}
                  {recipeBusy
                    ? t("photo.addRecipe.working")
                    : t("photo.addRecipe.action")}
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-2">
              {importAi.why && <NeedsAi task="import" why={importAi.why} />}
              {recipeError && <FieldError>{recipeError}</FieldError>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HugeiconsIcon
                  icon={ChartHistogramIcon}
                  strokeWidth={2}
                  className="size-5"
                />
                {t("photo.analyze.title")}
              </CardTitle>
              <CardDescription>
                {t("photo.analyze.description")}
              </CardDescription>
              <CardAction>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!file || analyzeBusy}
                  onClick={analyzeMeal}
                >
                  {analyzeBusy && <Spinner data-icon="inline-start" />}
                  {analyzeBusy
                    ? t("photo.analyze.working")
                    : t("photo.analyze.action")}
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-3">
              {nutritionAi.why && (
                <NeedsAi task="nutrition" why={nutritionAi.why} />
              )}
              {(jobQuery.data?.status === "queued" ||
                jobQuery.data?.status === "running") && (
                <p className="text-sm text-muted-foreground">
                  {t("photo.analyze.background")}
                </p>
              )}
              {analyzeError && <FieldError>{analyzeError}</FieldError>}
              {analysis && !logOpen && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setLogOpen(true)}
                >
                  {t("photo.log.accept")}
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HugeiconsIcon
                  icon={NoteAddIcon}
                  strokeWidth={2}
                  className="size-5"
                />
                {t("photo.log.title")}
              </CardTitle>
              <CardDescription>{t("photo.log.description")}</CardDescription>
              <CardAction>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!file || analyzeBusy}
                  onClick={openLog}
                >
                  {t("photo.log.action")}
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              {!analysis && (
                <p className="text-sm text-muted-foreground">
                  {t("photo.log.analyzeFirst")}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={logOpen && analysis != null} onOpenChange={setLogOpen}>
        <DialogContent className="sm:max-w-md">
          {analysis && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {analysis.name || t("photo.analyze.result")}
                </DialogTitle>
                <DialogDescription>
                  {t("photo.analyze.disclaimer")}
                </DialogDescription>
              </DialogHeader>
              <MealAnalysisBody analysis={analysis} />
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setLogOpen(false)}
                  disabled={addLog.isPending}
                >
                  {t("photo.log.reject")}
                </Button>
                <Button
                  disabled={addLog.isPending}
                  onClick={() => addLog.mutate(analysis)}
                >
                  {addLog.isPending && <Spinner data-icon="inline-start" />}
                  {addLog.isPending
                    ? t("photo.log.adding")
                    : t("photo.log.accept")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function NutrientRow({
  label,
  value,
  unit,
}: {
  label: string
  value?: number
  unit: string
}) {
  if (value === undefined) return null
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium tabular-nums">
        {value} {unit}
      </span>
    </div>
  )
}

function MealAnalysisBody({ analysis }: { analysis: Analysis }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      {analysis.description && (
        <p className="text-sm">{analysis.description}</p>
      )}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {analysis.serving && (
          <span>
            {t("photo.analyze.perServing", { serving: analysis.serving })}
          </span>
        )}
        {analysis.confidence && (
          <span>{t(`photo.analyze.confidence.${analysis.confidence}`)}</span>
        )}
      </div>
      <div className="divide-y rounded-md border px-3">
        <NutrientRow
          label={t("recipes.nutrition.nutrients.calories")}
          value={analysis.calories}
          unit="kcal"
        />
        <NutrientRow
          label={t("recipes.nutrition.nutrients.protein")}
          value={analysis.protein}
          unit="g"
        />
        <NutrientRow
          label={t("recipes.nutrition.nutrients.carbs")}
          value={analysis.carbs}
          unit="g"
        />
        <NutrientRow
          label={t("recipes.nutrition.nutrients.fat")}
          value={analysis.fat}
          unit="g"
        />
        <NutrientRow
          label={t("recipes.nutrition.nutrients.fiber")}
          value={analysis.fiber}
          unit="g"
        />
        <NutrientRow
          label={t("recipes.nutrition.nutrients.sugar")}
          value={analysis.sugar}
          unit="g"
        />
        <NutrientRow
          label={t("recipes.nutrition.nutrients.sodium")}
          value={analysis.sodium}
          unit="mg"
        />
      </div>
      {analysis.notes && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            {t("photo.analyze.notes")}:{" "}
          </span>
          {analysis.notes}
        </p>
      )}
    </div>
  )
}
