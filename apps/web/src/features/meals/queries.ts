import { queryOptions } from "@tanstack/react-query"

import { api, unwrap } from "@/lib/api/client"

export const mealLogsQuery = queryOptions({
  queryKey: ["meal-logs"],
  queryFn: () =>
    unwrap(
      api.GET("/api/meal-logs", {
        params: { query: { limit: 100, status: "all" } },
      })
    ),
  refetchInterval: (query) =>
    query.state.data?.logs?.some((log) => log.status === "processing")
      ? 2000
      : false,
})

export type MealLog = NonNullable<
  Awaited<ReturnType<NonNullable<typeof mealLogsQuery.queryFn>>>["logs"]
>[number]
