"use client"

import { Badge, Button } from "@voyant-travel/ui/components"
import { Switch } from "@voyant-travel/ui/components/switch"
import { Loader2, RotateCcw } from "lucide-react"

import {
  useStaffAlertPreferenceMutation,
  useStaffAlertPreferences,
} from "../hooks/use-staff-alerts.js"
import { useNotificationsUiMessagesOrDefault } from "../i18n/index.js"
import type { StaffAlertPreferenceRecord } from "../schemas.js"
import { STAFF_ALERT_GROUP_ORDER, type StaffAlertGroupKey } from "./staff-alert-groups.js"
import {
  StaffAlertNotice,
  StaffAlertRow,
  StaffAlertSection,
  StaffAlertShell,
} from "./staff-alert-layout.js"

export function MyNotificationsForm() {
  const messages = useNotificationsUiMessagesOrDefault()
  const copy = messages.staffAlerts
  const { data: preferences, isLoading } = useStaffAlertPreferences()

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

  if (!preferences || preferences.length === 0) {
    return (
      <StaffAlertShell>
        <StaffAlertNotice>{copy.empty}</StaffAlertNotice>
      </StaffAlertShell>
    )
  }

  const grouped = STAFF_ALERT_GROUP_ORDER.map((group) => ({
    group,
    rows: preferences.filter((row) => row.group === group),
  })).filter(({ rows }) => rows.length > 0)

  return (
    <StaffAlertShell>
      {grouped.map(({ group, rows }) => (
        <StaffAlertSection key={group} title={copy.groups[group as StaffAlertGroupKey]}>
          {rows.map((row) => (
            <PreferenceRow key={row.eventKey} row={row} />
          ))}
        </StaffAlertSection>
      ))}
    </StaffAlertShell>
  )
}

function PreferenceRow({ row }: { row: StaffAlertPreferenceRecord }) {
  const messages = useNotificationsUiMessagesOrDefault()
  const copy = messages.staffAlerts
  const mutation = useStaffAlertPreferenceMutation()

  const label = copy.alerts[row.eventKey]
  const title = label?.title ?? row.eventKey
  const description = label?.description ?? row.eventType

  // The point of this screen: "off because an admin disabled it" must not look
  // like "off because I chose that". A deployment-disabled alert is locked and
  // says so; everything else is the user's to change.
  const lockedByAdmin = !row.deploymentEnabled
  const isOverridden = row.override !== null

  return (
    <StaffAlertRow
      title={
        <>
          {title}
          {lockedByAdmin ? (
            <Badge variant="outline">{copy.state.disabledByAdmin}</Badge>
          ) : isOverridden ? (
            <Badge variant="secondary">{copy.state.overridden}</Badge>
          ) : null}
        </>
      }
      description={description}
      meta={
        lockedByAdmin
          ? copy.state.disabledByAdminDesc
          : isOverridden
            ? null
            : row.enabled
              ? copy.state.inheritedOn
              : copy.state.inheritedOff
      }
      control={
        <>
          {isOverridden && !lockedByAdmin ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => mutation.mutate({ eventKey: row.eventKey, enabled: null })}
              disabled={mutation.isPending}
            >
              <RotateCcw className="size-3.5" />
              {copy.state.resetToDefault}
            </Button>
          ) : null}
          <Switch
            checked={row.enabled}
            disabled={lockedByAdmin || mutation.isPending}
            onCheckedChange={(checked) =>
              mutation.mutate({ eventKey: row.eventKey, enabled: checked })
            }
            aria-label={title}
          />
        </>
      }
    />
  )
}
