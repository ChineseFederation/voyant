"use client"

import { MyNotificationsForm } from "../components/my-notifications-form.js"
import { useNotificationsUiMessagesOrDefault } from "../i18n/index.js"

/**
 * Packaged admin host for the signed-in user's own alert preferences.
 * Separate page from the admin settings on purpose: one is deployment
 * configuration, the other is a personal choice, and mixing them invites
 * someone to switch an alert off for the whole team when they meant themselves.
 */
export function MyNotificationsHost() {
  const messages = useNotificationsUiMessagesOrDefault()
  return (
    <div className="mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{messages.staffAlerts.myHeading}</h1>
        <p className="text-sm text-muted-foreground">{messages.staffAlerts.myDescription}</p>
      </div>
      <MyNotificationsForm />
    </div>
  )
}
