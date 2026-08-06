"use client"

import { Button } from "@voyant-travel/ui/components"
import { Switch } from "@voyant-travel/ui/components/switch"
import { Loader2, Settings2 } from "lucide-react"
import { useState } from "react"

import { useStaffAlertSettingMutation, useStaffAlertSettings } from "../hooks/use-staff-alerts.js"
import { useNotificationsUiMessagesOrDefault } from "../i18n/index.js"
import type { StaffAlertSettingRecord } from "../schemas.js"
import { STAFF_ALERT_GROUP_ORDER, type StaffAlertGroupKey } from "./staff-alert-groups.js"
import {
  StaffAlertNotice,
  StaffAlertRow,
  StaffAlertSection,
  StaffAlertShell,
} from "./staff-alert-layout.js"
import { StaffAlertRoutingDialog } from "./staff-alert-routing-dialog.js"

export function StaffAlertsForm() {
  const messages = useNotificationsUiMessagesOrDefault()
  const copy = messages.staffAlerts
  const { data: alerts, isLoading } = useStaffAlertSettings()
  const mutation = useStaffAlertSettingMutation()
  const [editing, setEditing] = useState<string | null>(null)

  if (isLoading) {
    return (
      <StaffAlertShell>
        <StaffAlertNotice>
          <Loader2 className="size-4 animate-spin" />
          {copy.loading}
        </StaffAlertNotice>
      </StaffAlertShell>
    )
  }

  if (!alerts || alerts.length === 0) {
    return (
      <StaffAlertShell>
        <StaffAlertNotice>{copy.empty}</StaffAlertNotice>
      </StaffAlertShell>
    )
  }

  const grouped = STAFF_ALERT_GROUP_ORDER.map((group) => ({
    group,
    rows: alerts.filter((alert) => alert.group === group),
  })).filter(({ rows }) => rows.length > 0)

  const editingAlert = alerts.find((alert) => alert.eventKey === editing) ?? null

  return (
    <>
      <StaffAlertShell>
        {grouped.map(({ group, rows }) => (
          <StaffAlertSection key={group} title={copy.groups[group as StaffAlertGroupKey]}>
            {rows.map((alert) => (
              <AlertRow
                key={alert.eventKey}
                alert={alert}
                onToggle={(enabled) => mutation.mutate({ eventKey: alert.eventKey, enabled })}
                onConfigure={() => setEditing(alert.eventKey)}
              />
            ))}
          </StaffAlertSection>
        ))}
      </StaffAlertShell>

      <StaffAlertRoutingDialog
        alert={editingAlert}
        open={editing !== null}
        onOpenChange={(open) => setEditing(open ? editing : null)}
      />
    </>
  )
}

function AlertRow({
  alert,
  onToggle,
  onConfigure,
}: {
  alert: StaffAlertSettingRecord
  onToggle: (enabled: boolean) => void
  onConfigure: () => void
}) {
  const messages = useNotificationsUiMessagesOrDefault()
  const copy = messages.staffAlerts
  const label = copy.alerts[alert.eventKey]
  const title = label?.title ?? alert.eventKey
  const description = label?.description ?? alert.eventType

  return (
    <StaffAlertRow
      title={title}
      description={description}
      meta={alert.enabled ? <RecipientSummary alert={alert} /> : null}
      control={
        <>
          {alert.enabled ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={onConfigure}
            >
              <Settings2 className="size-4" />
              {copy.actions.configure}
            </Button>
          ) : null}
          <Switch checked={alert.enabled} onCheckedChange={onToggle} aria-label={title} />
        </>
      }
    />
  )
}

/**
 * Who this alert reaches, as one scannable line.
 *
 * The list exists to answer "is this on, and who gets it" at a glance; making
 * an operator open each alert to learn the second half defeats the point.
 */
function RecipientSummary({ alert }: { alert: StaffAlertSettingRecord }) {
  const messages = useNotificationsUiMessagesOrDefault()
  const copy = messages.staffAlerts

  const parts: string[] = []
  if (alert.routeToAssignee) parts.push(copy.routing.assignee)
  for (const role of alert.routeToRoles) {
    parts.push(copy.roles[role as keyof typeof copy.roles] ?? role)
  }
  parts.push(...alert.extraAddresses)

  if (parts.length === 0) {
    return <span className="text-destructive">{copy.routing.noRecipients}</span>
  }
  return <span>{parts.join(" · ")}</span>
}
