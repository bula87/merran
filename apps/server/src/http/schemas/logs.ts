import { z } from "@hono/zod-openapi"

export const ServerLogEntrySchema = z
  .object({
    time: z.number(),
    level: z.number(),
    msg: z.string(),
  })
  .catchall(z.unknown())
  .openapi("ServerLogEntry")

export const ServerLogsSchema = z
  .object({
    entries: z.array(ServerLogEntrySchema),
  })
  .openapi("ServerLogs")

export const ServerLogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(200),
  level: z.coerce.number().int().min(10).max(60).optional(),
})
