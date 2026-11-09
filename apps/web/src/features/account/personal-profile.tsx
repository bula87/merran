import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { api, ApiError, unwrap } from "@/lib/api/client"

export const MEAL_SLOTS = [
  "breakfast",
  "morning-snack",
  "lunch",
  "afternoon-snack",
  "dinner",
] as const
export type MealSlot = (typeof MEAL_SLOTS)[number]

export const COOKING_DEVICES = ["mixer-thermomix", "air-fryer"] as const
export type CookingDevice = (typeof COOKING_DEVICES)[number]

export const GOALS = [
  "weight-loss",
  "more-energy",
  "better-eating-habits",
] as const
export type Goal = (typeof GOALS)[number]

export type UserProfile = {
  age: number | null
  weightKg: number | null
  heightCm: number | null
  allergies: string[]
  favoriteFoods: string[]
  dislikedFoods: string[]
  mealsPerDay: MealSlot[]
  cookingDevices: CookingDevice[]
  goal: Goal | null
}

export const myProfileQuery = queryOptions({
  queryKey: ["me", "profile"],
  queryFn: () => unwrap(api.GET("/api/auth/me/profile")),
})

function numOrNull(value: string) {
  const t = value.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function FoodListField({
  label,
  description,
  value,
  onChange,
  placeholder,
}: {
  label: string
  description?: string
  value: string[]
  onChange: (next: string[]) => void
  placeholder: string
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = React.useState("")

  function add(raw: string) {
    const items = raw
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (items.length === 0) return
    const seen = new Set(value.map((v) => v.toLocaleLowerCase()))
    const next = [...value]
    for (const item of items) {
      const key = item.toLocaleLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      next.push(item)
    }
    onChange(next)
    setDraft("")
  }

  return (
    <Field className="gap-2">
      <div>
        <FieldLabel>{label}</FieldLabel>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="flex gap-2">
        <Input
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              add(draft)
            }
          }}
        />
        <Button type="button" variant="outline" onClick={() => add(draft)}>
          {t("settings.personal.add")}
        </Button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((item) => (
            <Badge key={item} variant="secondary" className="gap-1 pr-1">
              {item}
              <button
                type="button"
                className="ml-1 rounded-full px-1 text-muted-foreground hover:text-foreground"
                aria-label={t("settings.personal.remove", { item })}
                onClick={() => onChange(value.filter((v) => v !== item))}
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      )}
    </Field>
  )
}

function toggle<T extends string>(list: T[], item: T, checked: boolean): T[] {
  return checked
    ? list.includes(item)
      ? list
      : [...list, item]
    : list.filter((v) => v !== item)
}

export function PersonalProfileCard() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data, isPending, isError } = useQuery(myProfileQuery)
  const [form, setForm] = React.useState<UserProfile | null>(null)

  React.useEffect(() => {
    if (data) setForm(data as UserProfile)
  }, [data])

  const save = useMutation({
    mutationFn: (profile: UserProfile) =>
      unwrap(api.PATCH("/api/auth/me/profile", { body: profile })),
    onSuccess: async (saved) => {
      setForm(saved as UserProfile)
      await queryClient.invalidateQueries({ queryKey: myProfileQuery.queryKey })
      toast.success(t("settings.personal.saved"))
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : t("photo.error"))
    },
  })

  if (isPending || !form) {
    return (
      <Card>
        <CardContent className="flex justify-center py-8">
          <Spinner />
        </CardContent>
      </Card>
    )
  }
  if (isError) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-destructive">
          {t("photo.error")}
        </CardContent>
      </Card>
    )
  }

  const set = <K extends keyof UserProfile>(key: K, value: UserProfile[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f))

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.personal.title")}</CardTitle>
        <CardDescription>{t("settings.personal.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field>
            <FieldLabel>{t("settings.personal.age")}</FieldLabel>
            <Input
              inputMode="numeric"
              value={form.age ?? ""}
              onChange={(e) =>
                set("age", numOrNull(e.target.value) as number | null)
              }
              placeholder={t("settings.personal.agePlaceholder")}
            />
          </Field>
          <Field>
            <FieldLabel>{t("settings.personal.weight")}</FieldLabel>
            <Input
              inputMode="decimal"
              value={form.weightKg ?? ""}
              onChange={(e) =>
                set("weightKg", numOrNull(e.target.value) as number | null)
              }
              placeholder="kg"
            />
          </Field>
          <Field>
            <FieldLabel>{t("settings.personal.height")}</FieldLabel>
            <Input
              inputMode="decimal"
              value={form.heightCm ?? ""}
              onChange={(e) =>
                set("heightCm", numOrNull(e.target.value) as number | null)
              }
              placeholder="cm"
            />
          </Field>
        </div>

        <FoodListField
          label={t("settings.personal.allergies")}
          description={t("settings.personal.allergiesDescription")}
          value={form.allergies}
          onChange={(v) => set("allergies", v)}
          placeholder={t("settings.personal.foodPlaceholder")}
        />
        <FoodListField
          label={t("settings.personal.favoriteFoods")}
          value={form.favoriteFoods}
          onChange={(v) => set("favoriteFoods", v)}
          placeholder={t("settings.personal.foodPlaceholder")}
        />
        <FoodListField
          label={t("settings.personal.dislikedFoods")}
          value={form.dislikedFoods}
          onChange={(v) => set("dislikedFoods", v)}
          placeholder={t("settings.personal.foodPlaceholder")}
        />

        <Field className="gap-3">
          <div>
            <FieldLabel>{t("settings.personal.mealsPerDay")}</FieldLabel>
            <p className="text-sm text-muted-foreground">
              {t("settings.personal.mealsPerDayDescription")}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {MEAL_SLOTS.map((slot) => (
              <label key={slot} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.mealsPerDay.includes(slot)}
                  onCheckedChange={(checked) =>
                    set(
                      "mealsPerDay",
                      toggle(form.mealsPerDay, slot, !!checked)
                    )
                  }
                />
                {t(`settings.personal.mealSlots.${slot}`)}
              </label>
            ))}
          </div>
        </Field>

        <Field className="gap-3">
          <FieldLabel>{t("settings.personal.cookingDevices")}</FieldLabel>
          <div className="grid gap-2 sm:grid-cols-2">
            {COOKING_DEVICES.map((device) => (
              <label key={device} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.cookingDevices.includes(device)}
                  onCheckedChange={(checked) =>
                    set(
                      "cookingDevices",
                      toggle(form.cookingDevices, device, !!checked)
                    )
                  }
                />
                {t(`settings.personal.devices.${device}`)}
              </label>
            ))}
          </div>
        </Field>

        <Field>
          <FieldLabel>{t("settings.personal.goal")}</FieldLabel>
          <Select
            value={form.goal ?? "__none__"}
            onValueChange={(value) =>
              set(
                "goal",
                value && value !== "__none__" ? (value as Goal) : null
              )
            }
          >
            <SelectTrigger className="w-full sm:max-w-xs">
              <SelectValue
                placeholder={t("settings.personal.goalPlaceholder")}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">
                {t("settings.personal.goalNone")}
              </SelectItem>
              {GOALS.map((goal) => (
                <SelectItem key={goal} value={goal}>
                  {t(`settings.personal.goals.${goal}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <div className="flex justify-end">
          <Button
            disabled={save.isPending}
            onClick={() => form && save.mutate(form)}
          >
            {save.isPending && <Spinner data-icon="inline-start" />}
            {t("common.save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
