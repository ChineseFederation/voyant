"use client"

import { StaffAlertsForm } from "../components/staff-alerts-form.js"
import { useNotificationsUiMessagesOrDefault } from "../i18n/index.js"

/**
 * Packaged admin host for the deployment-wide staff alert settings page.
 * Zero-prop: the form owns its own data wiring.
 */
export function StaffAlertsHost() {
  const messages = useNotificationsUiMessagesOrDefault()
  return (
    <div className="mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{messages.staffAlerts.heading}</h1>
        <p className="text-sm text-muted-foreground">{messages.staffAlerts.description}</p>
      </div>
      <StaffAlertsForm />
    </div>
  )
}
