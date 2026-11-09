import { useQuery } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"

import { serverLogsQuery } from "./queries"

type Entry = {
  time?: number
  level?: number
  msg?: string
  ai?: unknown
  [key: string]: unknown
}

const LEVELS: Record<
  number,
  {
    label: string
    variant: "secondary" | "default" | "outline" | "destructive"
  }
> = {
  10: { label: "trace", variant: "outline" },
  20: { label: "debug", variant: "outline" },
  30: { label: "info", variant: "secondary" },
  40: { label: "warn", variant: "default" },
  50: { label: "error", variant: "destructive" },
  60: { label: "fatal", variant: "destructive" },
}

function levelInfo(level?: number) {
  return (
    LEVELS[level ?? 30] ?? {
      label: String(level ?? ""),
      variant: "outline" as const,
    }
  )
}

function JsonDetails({ value }: { value: unknown }) {
  if (value == null) return null
  return (
    <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted/60 p-2 text-[11px] leading-relaxed break-all whitespace-pre-wrap">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

function EntryRow({ entry }: { entry: Entry }) {
  const { i18n } = useTranslation()
  const [open, setOpen] = React.useState(false)
  const lvl = levelInfo(entry.level)
  const when =
    typeof entry.time === "number"
      ? new Intl.DateTimeFormat(i18n.language, {
          dateStyle: "short",
          timeStyle: "medium",
        }).format(new Date(entry.time))
      : ""
  const hasDetails =
    entry.ai != null ||
    Object.keys(entry).some(
      (k) =>
        ![
          "time",
          "level",
          "msg",
          "requestId",
          "method",
          "path",
          "status",
          "ms",
        ].includes(k)
    )

  return (
    <li className="p-3">
      <button
        type="button"
        className="flex w-full items-start gap-2 text-left"
        onClick={() => hasDetails && setOpen((v) => !v)}
      >
        <Badge variant={lvl.variant} className="mt-0.5 shrink-0">
          {entry.ai ? "ai" : lvl.label}
        </Badge>
        <div className="min-w-0 flex-1">
          <p className="text-sm break-words">{entry.msg || "—"}</p>
          <p className="text-xs text-muted-foreground">
            {[
              when,
              entry.requestId
                ? `req ${String(entry.requestId).slice(0, 8)}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        {hasDetails && (
          <span className="shrink-0 text-xs text-muted-foreground">
            {open ? "−" : "+"}
          </span>
        )}
      </button>
      {open && hasDetails && <JsonDetails value={entry.ai ?? entry} />}
    </li>
  )
}

export function LogsCard() {
  const { t } = useTranslation()
  const [filter, setFilter] = React.useState<"all" | "ai" | "warn" | "error">(
    "all"
  )
  const level = filter === "warn" ? 40 : filter === "error" ? 50 : undefined
  const logs = useQuery(serverLogsQuery(level))

  const entries = (logs.data?.entries ?? []) as Entry[]
  const shown = filter === "ai" ? entries.filter((e) => e.ai != null) : entries

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.server.logs.title")}</CardTitle>
        <CardDescription>
          {t("settings.server.logs.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={filter}
            onValueChange={(v) => setFilter((v as typeof filter) ?? "all")}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {t("settings.server.logs.all")}
              </SelectItem>
              <SelectItem value="ai">{t("settings.server.logs.ai")}</SelectItem>
              <SelectItem value="warn">
                {t("settings.server.logs.warn")}
              </SelectItem>
              <SelectItem value="error">
                {t("settings.server.logs.error")}
              </SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void logs.refetch()}
          >
            {t("settings.server.logs.refresh")}
          </Button>
        </div>
        {logs.isPending ? (
          <Skeleton className="h-24 rounded-2xl" />
        ) : shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("settings.server.logs.none")}
          </p>
        ) : (
          <ul className="max-h-[32rem] divide-y overflow-y-auto rounded-2xl border">
            {shown.map((entry, i) => (
              <EntryRow key={`${entry.time}-${i}`} entry={entry} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
