"use client"

import {
  Badge,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@voyant-travel/ui/components"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldTitle,
} from "@voyant-travel/ui/components/field"
import { Switch } from "@voyant-travel/ui/components/switch"
import { Loader2, Plus, Send, X } from "lucide-react"
import { useState } from "react"

import {
  useStaffAlertSettingMutation,
  useStaffAlertTestMutation,
} from "../hooks/use-staff-alerts.js"
import { useNotificationsUiMessagesOrDefault } from "../i18n/index.js"
import type { StaffAlertSettingRecord } from "../schemas.js"

const ROLE_OPTIONS = ["owner", "admin", "member"] as const

export interface StaffAlertRoutingDialogProps {
  alert: StaffAlertSettingRecord | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Routing for one alert, edited in a focused surface.
 *
 * Inline expansion was tried first and made the list unreadable: a row that
 * grows by 300px when switched on turns a scannable settings list into a
 * ragged column, and nothing stays aligned. The list keeps uniform rows; the
 * configuration gets a place of its own.
 */
export function StaffAlertRoutingDialog({
  alert,
  open,
  onOpenChange,
}: StaffAlertRoutingDialogProps) {
  const messages = useNotificationsUiMessagesOrDefault()
  const copy = messages.staffAlerts
  const mutation = useStaffAlertSettingMutation()
  const testMutation = useStaffAlertTestMutation()
  const [newAddress, setNewAddress] = useState("")
  const [testFeedback, setTestFeedback] = useState<string | null>(null)

  if (!alert) return null

  const label = copy.alerts[alert.eventKey]
  const title = label?.title ?? alert.eventKey

  const save = (patch: Partial<StaffAlertSettingRecord>) => {
    mutation.mutate({
      eventKey: alert.eventKey,
      enabled: patch.enabled ?? alert.enabled,
      routeToAssignee: patch.routeToAssignee ?? alert.routeToAssignee,
      routeToRoles: patch.routeToRoles ?? alert.routeToRoles,
      extraAddresses: patch.extraAddresses ?? alert.extraAddresses,
    })
  }

  const toggleRole = (role: string) => {
    const next = alert.routeToRoles.includes(role)
      ? alert.routeToRoles.filter((entry) => entry !== role)
      : [...alert.routeToRoles, role]
    save({ routeToRoles: next })
  }

  const addAddress = () => {
    const trimmed = newAddress.trim().toLowerCase()
    if (!trimmed || alert.extraAddresses.includes(trimmed)) return
    save({ extraAddresses: [...alert.extraAddresses, trimmed] })
    setNewAddress("")
  }

  const runTest = async () => {
    setTestFeedback(null)
    const result = await testMutation.mutateAsync(alert.eventKey)
    if (result.sent && result.recipient) {
      setTestFeedback(copy.test.sent.replace("{recipient}", result.recipient))
      return
    }
    if (result.reason === "staff_alerts_not_wired") return setTestFeedback(copy.test.notWired)
    if (result.reason === "no_email_on_account") return setTestFeedback(copy.test.noEmail)
    setTestFeedback(copy.test.failed.replace("{reason}", result.reason ?? ""))
  }

  const hasNoRecipients =
    !alert.routeToAssignee && alert.routeToRoles.length === 0 && alert.extraAddresses.length === 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{copy.routing.dialogDescription}</DialogDescription>
        </DialogHeader>

        <DialogBody>
          <FieldGroup className="gap-6">
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>{copy.routing.assignee}</FieldTitle>
                <FieldDescription>
                  {alert.supportsAssigneeRouting
                    ? copy.routing.assigneeDesc
                    : copy.routing.assigneeUnavailable}
                </FieldDescription>
              </FieldContent>
              <Switch
                checked={alert.routeToAssignee}
                disabled={!alert.supportsAssigneeRouting}
                onCheckedChange={(checked) => save({ routeToAssignee: checked })}
                aria-label={copy.routing.assignee}
              />
            </Field>

            <div className="space-y-2.5">
              <div className="space-y-1">
                <p className="text-sm font-medium">{copy.routing.roles}</p>
                <p className="text-sm text-muted-foreground">{copy.routing.rolesDesc}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {ROLE_OPTIONS.map((role) => (
                  <Button
                    key={role}
                    type="button"
                    size="sm"
                    variant={alert.routeToRoles.includes(role) ? "default" : "outline"}
                    onClick={() => toggleRole(role)}
                  >
                    {copy.roles[role]}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="space-y-1">
                <p className="text-sm font-medium">{copy.routing.extraAddresses}</p>
                <p className="text-sm text-muted-foreground">{copy.routing.extraAddressesDesc}</p>
              </div>
              {alert.extraAddresses.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {alert.extraAddresses.map((address) => (
                    <Badge key={address} variant="secondary" className="gap-1.5 py-1 pr-1 pl-2.5">
                      {address}
                      <button
                        type="button"
                        className="rounded-sm opacity-60 transition-opacity hover:opacity-100"
                        onClick={() =>
                          save({
                            extraAddresses: alert.extraAddresses.filter(
                              (entry) => entry !== address,
                            ),
                          })
                        }
                        aria-label={`${copy.routing.removeAddress} ${address}`}
                      >
                        <X className="size-3.5" />
                      </button>
                    </Badge>
                  ))}
                </div>
              ) : null}
              <div className="flex gap-2">
                <Input
                  value={newAddress}
                  onChange={(event) => setNewAddress(event.target.value)}
                  placeholder={copy.routing.addressPlaceholder}
                  type="email"
                  // Inputs carry a default min-width; without `min-w-0` the row
                  // refuses to shrink and the dialog grows a horizontal
                  // scrollbar instead of the field getting narrower.
                  className="min-w-0 flex-1"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault()
                      addAddress()
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={addAddress}>
                  <Plus className="size-4" />
                  {copy.routing.addAddress}
                </Button>
              </div>
            </div>

            {hasNoRecipients ? (
              <p className="text-sm text-destructive">{copy.routing.noRecipients}</p>
            ) : null}
          </FieldGroup>
        </DialogBody>

        <DialogFooter className="sm:justify-between">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={runTest}
              disabled={testMutation.isPending}
            >
              {testMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              {testMutation.isPending ? copy.actions.sending : copy.actions.sendTest}
            </Button>
          </div>
          <Button type="button" onClick={() => onOpenChange(false)}>
            {copy.actions.done}
          </Button>
        </DialogFooter>

        {testFeedback ? (
          <p className="px-6 pb-4 text-sm text-muted-foreground">{testFeedback}</p>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
