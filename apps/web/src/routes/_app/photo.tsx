import {
  Camera01Icon,
  Cancel01Icon,
  ChartHistogramIcon,
  CookBookIcon,
  Image01Icon,
  NoteAddIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { PageHeader } from "@/components/layout/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { FieldError } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { useCanTakePhoto } from "@/features/assistant/attachments"
import { NeedsAi, useAiFor } from "@/features/ai/needs-ai"
import { ApiError, api, unwrap } from "@/lib/api/client"
import { shrinkPhoto } from "@/lib/shrink-photo"

export const Route = createFileRoute("/_app/photo")({
  component: PhotoPage,
})

const MAX_SIDE = 2000

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
  const importAi = useAiFor("import")
  const nutritionAi = useAiFor("nutrition")
  const canTakePhoto = useCanTakePhoto()
  const fileInput = React.useRef<HTMLInputElement>(null)
  const cameraInput = React.useRef<HTMLInputElement>(null)

  const [file, setFile] = React.useState<File | null>(null)
  const [preview, setPreview] = React.useState<string | null>(null)
  const [recipeBusy, setRecipeBusy] = React.useState(false)
  const [recipeError, setRecipeError] = React.useState<string | null>(null)
  const [analyzeBusy, setAnalyzeBusy] = React.useState(false)
  const [analyzeError, setAnalyzeError] = React.useState<string | null>(null)
  const [analysis, setAnalysis] = React.useState<Analysis | null>(null)

  React.useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  function clearResult() {
    setRecipeError(null)
    setAnalyzeError(null)
    setAnalysis(null)
  }

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
    setAnalysis(null)
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
    setAnalyzeBusy(true)
    setAnalyzeError(null)
    setAnalysis(null)
    try {
      const blob = await shrinkPhoto(file, MAX_SIDE)
      const form = new FormData()
      form.append("photo", blob, file.name || "meal.jpg")
      const data = await unwrap(
        api.POST("/api/nutrition/photo", {
          body: form as unknown as { photo?: string },
        })
      )
      setAnalysis(data as Analysis)
    } catch (err) {
      setAnalyzeError(err instanceof ApiError ? err.message : t("photo.error"))
    } finally {
      setAnalyzeBusy(false)
    }
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
              {analyzeError && <FieldError>{analyzeError}</FieldError>}
              {analysis && <MealAnalysis analysis={analysis} />}
            </CardContent>
          </Card>

          <Card className="opacity-80">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-muted-foreground">
                <HugeiconsIcon
                  icon={NoteAddIcon}
                  strokeWidth={2}
                  className="size-5"
                />
                {t("photo.log.title")}
              </CardTitle>
              <CardDescription>{t("photo.log.description")}</CardDescription>
              <CardAction>
                <Button type="button" variant="outline" disabled>
                  {t("photo.log.action")}
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {t("photo.log.soon")}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
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

function MealAnalysis({ analysis }: { analysis: Analysis }) {
  const { t } = useTranslation()
  return (
    <Alert>
      <HugeiconsIcon icon={ChartHistogramIcon} strokeWidth={2} />
      <AlertTitle>{analysis.name || t("photo.analyze.result")}</AlertTitle>
      <AlertDescription className="space-y-3">
        {analysis.description && <p>{analysis.description}</p>}
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
        <div className="divide-y rounded-md border bg-background/60 px-3">
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
          <p className="text-sm">
            <span className="font-medium">{t("photo.analyze.notes")}: </span>
            {analysis.notes}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {t("photo.analyze.disclaimer")}
        </p>
      </AlertDescription>
    </Alert>
  )
}
