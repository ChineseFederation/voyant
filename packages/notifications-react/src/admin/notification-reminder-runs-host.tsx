"use client"

import {
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voyant-travel/ui/components"
import { Loader2 } from "lucide-react"
import { useState } from "react"
import { useNotificationsUiI18nOrDefault } from "../i18n/index.js"
import { type UseNotificationReminderRunsOptions, useNotificationReminderRuns } from "../index.js"

/**
 * Packaged admin host for the reminder runs page (packaged-admin RFC
 * Phase 3). Zero-prop, read-only: filter state stays component-local and
 * there is no cross-route navigation.
 */
export function NotificationReminderRunsHost() {
  const { formatDateTime, messages } = useNotificationsUiI18nOrDefault()
  const t = messages.admin.reminderRunsPage
  const table = messages.admin.common.table
  const common = messages.admin.common
  const [status, setStatus] = useState<UseNotificationReminderRunsOptions["status"] | "all">("all")
  const { data, isPending } = useNotificationReminderRuns({
    status: status === "all" ? undefined : status,
    limit: 50,
    offset: 0,
  })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t.title}</h1>
        <p className="text-sm text-muted-foreground">{t.description}</p>
      </div>

      <div className="flex items-center gap-3">
        <Select value={status} onValueChange={(value) => setStatus(value ?? "all")}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder={common.statusFilterPlaceholder} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{common.allStatuses}</SelectItem>
            <SelectItem value="queued">{common.statusQueued}</SelectItem>
            <SelectItem value="processing">{common.statusProcessing}</SelectItem>
            <SelectItem value="sent">{common.statusSent}</SelectItem>
            <SelectItem value="skipped">{common.statusSkipped}</SelectItem>
            <SelectItem value="failed">{common.statusFailed}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isPending ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : null}

      {!isPending && (!data?.data || data.data.length === 0) ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">{t.empty}</p>
        </div>
      ) : null}

      {!isPending && data?.data && data.data.length > 0 ? (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">{table.rule}</th>
                <th className="px-4 py-3">{table.target}</th>
                <th className="px-4 py-3">{table.recipient}</th>
                <th className="px-4 py-3">{table.status}</th>
                <th className="px-4 py-3">{table.processed}</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((run) => (
                <tr key={run.id} className="border-t">
                  <td className="px-4 py-3">
                    <div className="font-medium">{run.reminderRule.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {run.reminderRule.slug}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div>{run.targetType}</div>
                    <div className="font-mono text-xs text-muted-foreground">{run.targetId}</div>
                  </td>
                  <td className="px-4 py-3">{run.recipient ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={
                        run.status === "sent"
                          ? "default"
                          : run.status === "failed"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {run.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">{formatDateTime(run.processedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
