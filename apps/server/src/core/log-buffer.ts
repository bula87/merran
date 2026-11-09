export type LogEntry = {
  time: number
  level: number
  msg: string
  [key: string]: unknown
}

const REDACT = new Set([
  "authorization",
  "cookie",
  "password",
  "apiKey",
  "apikey",
  "token",
  "secret",
  "authorization",
])

function truncateString(value: string, max: number) {
  if (value.length <= max) return value
  return `${value.slice(0, max)}… [${value.length} chars]`
}

function sanitize(value: unknown, depth: number, key?: string): unknown {
  if (key && REDACT.has(key)) return "[redacted]"
  if (value == null) return value
  if (typeof value === "string") return truncateString(value, 4000)
  if (typeof value === "number" || typeof value === "boolean") return value
  if (value instanceof Error)
    return { name: value.name, message: truncateString(value.message, 1000) }
  if (value instanceof Date) return value.toISOString()
  if (Buffer.isBuffer(value)) return `[buffer ${value.length} bytes]`
  if (value instanceof Uint8Array) return `[bytes ${value.byteLength} bytes]`
  if (Array.isArray(value)) {
    if (depth <= 0) return `[array ${value.length}]`
    const max = 40
    const items = value.slice(0, max).map((item) => sanitize(item, depth - 1))
    if (value.length > max) items.push(`… ${value.length - max} more`)
    return items
  }
  if (typeof value === "object") {
    if (depth <= 0) return "[object]"
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // Skip pino internals/noisy bindings
      if (k === "pid" || k === "hostname") continue
      // Summarize binary/image data in AI content
      if (k === "image" || k === "data") {
        if (Buffer.isBuffer(v) || v instanceof Uint8Array)
          out[k] = `[binary ${(v as Uint8Array).byteLength} bytes]`
        else if (typeof v === "string" && v.length > 500)
          out[k] = `[string ${v.length} chars]`
        else out[k] = sanitize(v, depth - 1, k)
        continue
      }
      out[k] = sanitize(v, depth - 1, k)
    }
    return out
  }
  return String(value)
}

export class LogBuffer {
  private readonly max: number
  private readonly items: LogEntry[] = []

  constructor(max = 1500) {
    this.max = max
  }

  push(entry: Record<string, unknown>) {
    const time = typeof entry.time === "number" ? entry.time : Date.now()
    const level = typeof entry.level === "number" ? entry.level : 30
    const msg = typeof entry.msg === "string" ? entry.msg : ""
    const data: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(entry)) {
      if (k === "time" || k === "level" || k === "msg") continue
      data[k] = sanitize(v, 5, k)
    }
    this.items.push({ time, level, msg, ...data })
    if (this.items.length > this.max)
      this.items.splice(0, this.items.length - this.max)
  }

  entries(options: { limit?: number; level?: number } = {}): LogEntry[] {
    const limit = Math.min(Math.max(options.limit ?? 200, 1), 1000)
    let items = this.items
    if (options.level != null)
      items = items.filter((item) => item.level >= options.level!)
    return items.slice(-limit).reverse()
  }

  clear() {
    this.items.length = 0
  }
}

export function createLogBuffer(max?: number) {
  return new LogBuffer(max)
}
