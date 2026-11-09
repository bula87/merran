import { createFileRoute } from "@tanstack/react-router"

import { MealsPage } from "@/features/meals/meals-page"

export const Route = createFileRoute("/_app/meals")({
  component: MealsPage,
})
