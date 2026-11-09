import { queryOptions } from "@tanstack/react-query"

import { api, unwrap } from "@/lib/api/client"

const queryFn = () =>
  unwrap(api.GET("/api/meal-logs", { params: { query: { limit: 50 } } }))

export const mealLogsQuery = queryOptions({
  queryKey: ["meal-logs"],
  queryFn,
})

export type MealLog = Awaited<ReturnType<typeof queryFn>>["logs"][number]
