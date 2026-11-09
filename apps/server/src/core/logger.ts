import { pino, type Logger } from "pino"
import type { Config } from "./config.ts"
import type { LogBuffer } from "./log-buffer.ts"

/** Keys whose values never reach the logs, wherever they turn up. */
const REDACTED = [
  "authorization",
  "cookie",
  "password",
  "apiKey",
  "token",
  "secret",
].flatMap((key) => [key, `*.${key}`])

export function createLogger(
  config: Pick<Config, "logLevel" | "logFormat">,
  logs?: LogBuffer
): Logger {
  return pino({
    level: config.logLevel,
    redact: { paths: REDACTED, censor: "[redacted]" },
    hooks: logs
      ? {
          logMethod(inputArgs, method, level) {
            try {
              const [first, second] = inputArgs as [unknown, unknown?]
              const obj =
                first && typeof first === "object" && !Array.isArray(first)
                  ? (first as Record<string, unknown>)
                  : {}
              const msg =
                typeof first === "string"
                  ? first
                  : typeof second === "string"
                    ? second
                    : typeof obj.msg === "string"
                      ? obj.msg
                      : ""
              logs.push({ time: Date.now(), level, msg, ...obj })
            } catch {
              // Logging must not break the app.
            }
            method.apply(this, inputArgs as Parameters<typeof method>)
          },
        }
      : undefined,
    ...(config.logFormat === "pretty"
      ? {
          transport: {
            target: "pino-pretty",
            options: { translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname" },
          },
        }
      : {}),
  })
}
