import { useSuspenseQuery } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { LockedNote } from "@/features/settings/setting-fields"
import { ApiError } from "@/lib/api/client"

import { serverSettingsQuery, useSaveServerSettings } from "./queries"

const ENABLED = "recipeTranslations.enabled"
const HOUR = "recipeTranslations.hour"

export function RecipeTranslationsCard() {
  const { t } = useTranslation()
  const { data } = useSuspenseQuery(serverSettingsQuery)
  const save = useSaveServerSettings()
  const [saving, setSaving] = React.useState<string | null>(null)
  const id = React.useId()
  const enabled = data.settings.find((s) => s.key === ENABLED)
  const hour = data.settings.find((s) => s.key === HOUR)
  const on = enabled?.value === true
  const hourValue = typeof hour?.value === "number" ? hour.value : 3

  async function saveEnabled(next: boolean) {
    setSaving("enabled")
    try {
      await save({ [ENABLED]: next })
      toast.success(t("settings.server.recipeTranslations.saved"))
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      toast.error(error.message)
    } finally {
      setSaving(null)
    }
  }

  async function saveHour(value: number) {
    if (!Number.isInteger(value) || value < 0 || value > 23) return
    setSaving("hour")
    try {
      await save({ [HOUR]: value })
      toast.success(t("settings.server.recipeTranslations.saved"))
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      toast.error(error.message)
    } finally {
      setSaving(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.server.recipeTranslations.title")}</CardTitle>
        <CardDescription>
          {t("settings.server.recipeTranslations.description")}
        </CardDescription>
        <CardAction>
          <Badge variant={on ? "default" : "secondary"}>
            {on ? t("common.on") : t("common.off")}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          {enabled && (
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor={`${id}-enabled`}>
                  {t("settings.server.recipeTranslations.enabled")}
                </FieldLabel>
                <FieldDescription>
                  {enabled.lockedBy ? (
                    <LockedNote state={enabled} />
                  ) : (
                    t("settings.server.recipeTranslations.enabledHint")
                  )}
                </FieldDescription>
              </FieldContent>
              {saving === "enabled" && <Spinner />}
              <Switch
                id={`${id}-enabled`}
                checked={on}
                onCheckedChange={(next) => void saveEnabled(next)}
                disabled={saving !== null || enabled.lockedBy !== null}
              />
            </Field>
          )}
          {hour && (
            <Field>
              <FieldLabel htmlFor={`${id}-hour`}>
                {t("settings.server.recipeTranslations.hour")}
              </FieldLabel>
              <div className="flex items-center gap-2">
                <Input
                  id={`${id}-hour`}
                  type="number"
                  min={0}
                  max={23}
                  step={1}
                  className="w-24"
                  defaultValue={hourValue}
                  disabled={saving !== null || hour.lockedBy !== null}
                  onBlur={(e) => {
                    const value = Number(e.currentTarget.value)
                    if (value !== hourValue) void saveHour(value)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur()
                  }}
                />
                {saving === "hour" && <Spinner />}
              </div>
              <FieldDescription>
                {hour.lockedBy ? (
                  <LockedNote state={hour} />
                ) : (
                  t("settings.server.recipeTranslations.hourHint")
                )}
              </FieldDescription>
            </Field>
          )}
        </FieldGroup>
      </CardContent>
    </Card>
  )
}
