import { createFileRoute } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { PersonalProfileCard } from "@/features/account/personal-profile"
import { SettingsPage } from "@/features/settings/settings-page"

export const Route = createFileRoute("/_app/settings/personal")({
  component: PersonalSettings,
})

function PersonalSettings() {
  const { t } = useTranslation()

  return (
    <SettingsPage
      groups={[
        {
          id: "personal-profile",
          title: t("settings.personal.group.title"),
          description: t("settings.personal.group.description"),
          content: <PersonalProfileCard />,
        },
      ]}
    />
  )
}
