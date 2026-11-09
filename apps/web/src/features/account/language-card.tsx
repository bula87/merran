import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { setLanguage } from "@/i18n"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { FieldGroup, FieldLabel } from "@/components/ui/field"
import { RadioGroup, RadioItem } from "@/components/ui/radio-group"
import { useMe } from "@/features/auth/use-me"
import { api, ApiError, unwrap } from "@/lib/api/client"

/** Lets the signed-in person pick the UI language for themselves. */
export function LanguageCard() {
  const { t } = useTranslation()
  const me = useMe()
  const language = me.language ?? ""

  const options = [
    { value: "en", label: t("settings.you.groups.language.english") },
    { value: "pl", label: t("settings.you.groups.language.polish") },
    { value: "fr", label: t("settings.you.groups.language.french") },
    { value: "es", label: t("settings.you.groups.language.spanish") },
    { value: "de", label: t("settings.you.groups.language.german") },
  ]

  const onLanguageChange = async (value: string) => {
    try {
      await unwrap(
        api.PATCH("/api/auth/me/language", { body: { language: value } })
      )
      setLanguage(value)
      toast.success(t("settings.you.groups.language.saved"))
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      toast.error(error.message)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.you.groups.language.title")}</CardTitle>
        <CardDescription>
          {t("settings.you.groups.language.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <FieldLabel>{t("settings.you.groups.language.label")}</FieldLabel>
          <RadioGroup
            value={language}
            onValueChange={(value) => {
              if (value !== language) {
                void onLanguageChange(value)
              }
            }}
          >
            {options.map((option) => (
              <RadioItem key={option.value} value={option.value}>
                {option.label}
              </RadioItem>
            ))}
          </RadioGroup>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}
