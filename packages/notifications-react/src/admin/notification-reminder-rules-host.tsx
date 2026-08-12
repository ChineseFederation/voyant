"use client"

import { useAdminHref, useAdminNavigate } from "@voyant-travel/admin"
import {
  Badge,
  Button,
  buttonVariants,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voyant-travel/ui/components"
import { Layers, Loader2, Pencil, Plus, Search } from "lucide-react"
import { useState } from "react"
import { type NotificationsUiMessages, useNotificationsUiMessagesOrDefault } from "../i18n/index.js"
import {
  type NotificationReminderRuleRecord,
  type UseNotificationReminderRulesOptions,
  useNotificationReminderRules,
} from "../index.js"
import { NotificationReminderRuleDialog } from "./notification-reminder-rule-dialog.js"
import { DestinationLink } from "./notifications-admin-shared.js"

const reminderTargetKeys = [
  "booking_confirmed",
  "booking_payment_schedule",
  "payment_complete",
  "booking_cancelled_non_payment",
] as const

function getReminderTargetLabel(
  targets: NotificationsUiMessages["admin"]["reminderRulesPage"]["targets"],
  targetType: NotificationReminderRuleRecord["targetType"],
) {
  return targets[targetType] ?? targetType
}

/**
 * Packaged admin host for the reminder rules list page (packaged-admin RFC
 * Phase 3). Zero-prop: list/filter state stays component-local and the
 * per-rule "Manage stages" link resolves through the
 * `notificationReminderRule.detail` semantic destination.
 */
export function NotificationReminderRulesHost() {
  const messages = useNotificationsUiMessagesOrDefault()
  const t = messages.admin.reminderRulesPage
  const common = messages.admin.common
  const table = common.table
  const resolveHref = useAdminHref()
  const navigateTo = useAdminNavigate()
  const [search, setSearch] = useState("")
  const [channel, setChannel] = useState<UseNotificationReminderRulesOptions["channel"] | "all">(
    "all",
  )
  const [status, setStatus] = useState<UseNotificationReminderRulesOptions["status"] | "all">("all")
  const [targetType, setTargetType] = useState<
    UseNotificationReminderRulesOptions["targetType"] | "all"
  >("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<NotificationReminderRuleRecord | undefined>()
  const { data, isPending, refetch } = useNotificationReminderRules({
    search,
    channel: channel === "all" ? undefined : channel,
    status: status === "all" ? undefined : status,
    targetType: targetType === "all" ? undefined : targetType,
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t.title}</h1>
          <p className="text-sm text-muted-foreground">{t.description}</p>
        </div>
        <Button
          onClick={() => {
            setEditing(undefined)
            setDialogOpen(true)
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          {t.newRule}
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t.searchPlaceholder}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={targetType} onValueChange={(value) => setTargetType(value ?? "all")}>
          <SelectTrigger className="w-[190px]">
            <SelectValue placeholder={t.targetFilterPlaceholder} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.allTargets}</SelectItem>
            {reminderTargetKeys.map((value) => (
              <SelectItem key={value} value={value}>
                {t.targets[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={channel} onValueChange={(value) => setChannel(value ?? "all")}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder={common.channelFilterPlaceholder} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{common.allChannels}</SelectItem>
            <SelectItem value="email">{common.channelEmail}</SelectItem>
            <SelectItem value="sms">{common.channelSms}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(value) => setStatus(value ?? "all")}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder={common.statusFilterPlaceholder} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{common.allStatuses}</SelectItem>
            <SelectItem value="draft">{common.statusDraft}</SelectItem>
            <SelectItem value="active">{common.statusActive}</SelectItem>
            <SelectItem value="archived">{common.statusArchived}</SelectItem>
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
                <th className="px-4 py-3">{table.channel}</th>
                <th className="px-4 py-3">{table.status}</th>
                <th className="px-4 py-3 text-right">{table.actions}</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((rule) => (
                <tr key={rule.id} className="border-t">
                  <td className="px-4 py-3">
                    <div className="font-medium">{rule.name}</div>
                  </td>
                  <td className="px-4 py-3">
                    {getReminderTargetLabel(t.targets, rule.targetType)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">{rule.channel}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={rule.status === "active" ? "default" : "secondary"}>
                      {rule.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <DestinationLink
                        href={resolveHref("notificationReminderRule.detail", {
                          ruleId: rule.id,
                        })}
                        onNavigate={() =>
                          navigateTo("notificationReminderRule.detail", { ruleId: rule.id })
                        }
                        className={buttonVariants({ variant: "ghost", size: "sm" })}
                      >
                        <Layers className="mr-2 h-4 w-4" />
                        {t.manageStages}
                      </DestinationLink>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditing(rule)
                          setDialogOpen(true)
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <NotificationReminderRuleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        rule={editing}
        onSuccess={() => {
          setDialogOpen(false)
          setEditing(undefined)
          void refetch()
        }}
      />
    </div>
  )
}
