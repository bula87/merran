import { z } from "@hono/zod-openapi"
import { MEALS } from "@merran/shared"
import { IDS } from "./examples.ts"

export const MealTimeSchema = z
  .object({
    start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a 24-hour time."),
    minutes: z.number().int().min(15).max(240),
  })
  .openapi({ example: { start: "18:00", minutes: 60 } })

export const MealTimesSchema = z
  .object({
    breakfast: MealTimeSchema,
    "morning-snack": MealTimeSchema,
    lunch: MealTimeSchema,
    "afternoon-snack": MealTimeSchema,
    dinner: MealTimeSchema,
  })
  .openapi("CalendarMealTimes")

export const CalendarLinkSchema = z
  .object({ id: z.string(), createdAt: z.iso.datetime() })
  .openapi("CalendarLink", {
    example: { id: IDS.invite, createdAt: "2026-10-19T18:00:00.000Z" },
  })

export const CalendarSettingsSchema = z
  .object({
    enabled: z.boolean(),
    times: MealTimesSchema,
    publicUrlReady: z.boolean(),
    links: z.array(CalendarLinkSchema),
  })
  .openapi("CalendarSettings", {
    example: {
      enabled: true,
      times: {
        breakfast: { start: "08:00", minutes: 30 },
        "morning-snack": { start: "10:30", minutes: 20 },
        lunch: { start: "12:30", minutes: 45 },
        "afternoon-snack": { start: "15:30", minutes: 20 },
        dinner: { start: "18:30", minutes: 60 },
      },
      publicUrlReady: true,
      links: [{ id: IDS.invite, createdAt: "2026-10-19T18:00:00.000Z" }],
    },
  })

export const CalendarSettingsChangesSchema = z
  .object({
    enabled: z.boolean().optional(),
    times: MealTimesSchema.optional(),
  })
  .openapi({ example: { enabled: true } })

export const NewCalendarLinkSchema = CalendarLinkSchema.extend({
  url: z.url(),
}).openapi("NewCalendarLink", {
  example: {
    id: IDS.invite,
    createdAt: "2026-10-19T18:00:00.000Z",
    url: "https://merran.example.com/api/plan/calendar/feed/example-secret-token",
  },
})

export const CalendarLinkParam = z.object({
  linkId: z.string().openapi({
    param: { name: "linkId", in: "path" },
    example: IDS.invite,
  }),
})

export const CalendarSlotSchema = z
  .object({
    date: z.iso.date(),
    meal: z.enum(MEALS),
    start: MealTimeSchema.shape.start,
    minutes: MealTimeSchema.shape.minutes,
  })
  .openapi("CalendarSlotTime", {
    example: {
      date: "2026-10-19",
      meal: "dinner",
      start: "19:30",
      minutes: 60,
    },
  })

export const CalendarSlotParam = z.object({
  date: z.string().openapi({
    param: { name: "date", in: "path" },
    example: "2026-10-19",
  }),
  meal: z.string().openapi({
    param: { name: "meal", in: "path" },
    example: "dinner",
  }),
})

export const CalendarSlotQuery = z.object({
  from: z.iso.date().openapi({ example: "2026-10-19" }),
  to: z.iso.date().openapi({ example: "2026-10-25" }),
})
