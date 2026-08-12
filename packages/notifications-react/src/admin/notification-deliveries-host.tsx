"use client"

import {
  Badge,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voyant-travel/ui/components"
import { Loader2, RotateCcw, Search } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { type NotificationsUiMessages, useNotificationsUiI18nOrDefault } from "../i18n/index.js"
import {
  type NotificationDeliveryRecord,
  type UseNotificationDeliveriesOptions,
  useNotificationDeliveries,
  useNotificationDeliveryMutation,
} from "../index.js"

/**
 * Packaged admin host for the notification deliveries page (packaged-admin
 * RFC Phase 3). Zero-prop: filter state stays component-local and the
 * details dialog is in-page — no cross-route navigation.
 */
export function NotificationDeliveriesHost() {
  const { formatDateTime, messages } = useNotificationsUiI18nOrDefault()
  const t = messages.admin.deliveriesPage
  const common = messages.admin.common
  const table = common.table
  const [channel, setChannel] = useState<UseNotificationDeliveriesOptions["channel"] | "all">("all")
  const [status, setStatus] = useState<UseNotificationDeliveriesOptions["status"] | "all">("all")
  const [selectedDelivery, setSelectedDelivery] = useState<NotificationDeliveryRecord | null>(null)
  const deliveryMutation = useNotificationDeliveryMutation()
  const selectedDeliveryId = selectedDelivery?.id
  const { data, isPending } = useNotificationDeliveries({
    channel: channel === "all" ? undefined : channel,
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
            <SelectItem value="pending">{common.statusPending}</SelectItem>
            <SelectItem value="sent">{common.statusSent}</SelectItem>
            <SelectItem value="failed">{common.statusFailed}</SelectItem>
            <SelectItem value="cancelled">{common.statusCancelled}</SelectItem>
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
                <th className="px-4 py-3">{table.to}</th>
                <th className="px-4 py-3">{table.template}</th>
                <th className="px-4 py-3">{table.channel}</th>
                <th className="px-4 py-3">{table.provider}</th>
                <th className="px-4 py-3">{table.status}</th>
                <th className="px-4 py-3">{table.created}</th>
                <th className="px-4 py-3 text-right">{table.logs}</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((delivery) => (
                <tr key={delivery.id} className="border-t">
                  <td className="px-4 py-3">
                    <div>{delivery.toAddress}</div>
                    {delivery.subject ? (
                      <div className="text-xs text-muted-foreground">{delivery.subject}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {delivery.templateSlug ?? common.directTemplate}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">{delivery.channel}</Badge>
                  </td>
                  <td className="px-4 py-3">{delivery.provider}</td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={
                        delivery.status === "sent"
                          ? "default"
                          : delivery.status === "failed"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {delivery.status}
                    </Badge>
                    {delivery.status === "failed" && delivery.errorMessage ? (
                      <div className="mt-1 max-w-[280px] truncate text-destructive text-xs">
                        {delivery.errorMessage}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{formatDateTime(delivery.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      {delivery.status === "failed" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={deliveryMutation.resend.isPending}
                          onClick={() => {
                            deliveryMutation.resend.mutate(delivery.id, {
                              onError(error) {
                                toast.error(error instanceof Error ? error.message : t.resendFailed)
                              },
                            })
                          }}
                        >
                          {deliveryMutation.resend.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <RotateCcw className="mr-2 h-4 w-4" />
                          )}
                          {t.resend}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedDelivery(delivery)}
                      >
                        <Search className="mr-2 h-4 w-4" />
                        {t.detailsButton}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <DeliveryDetailsDialog
        messages={messages}
        delivery={selectedDelivery}
        open={Boolean(selectedDelivery)}
        onOpenChange={(open) => {
          if (!open) setSelectedDelivery(null)
        }}
        onResend={
          selectedDelivery?.status === "failed" && selectedDeliveryId
            ? () => {
                deliveryMutation.resend.mutate(selectedDeliveryId, {
                  onError(error) {
                    toast.error(error instanceof Error ? error.message : t.resendFailed)
                  },
                })
              }
            : undefined
        }
        isResending={deliveryMutation.resend.isPending}
      />
    </div>
  )
}

function DeliveryDetailsDialog({
  messages,
  delivery,
  open,
  onOpenChange,
  onResend,
  isResending = false,
}: {
  messages: NotificationsUiMessages
  delivery: NotificationDeliveryRecord | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onResend?: () => void
  isResending?: boolean
}) {
  const { formatDateTime } = useNotificationsUiI18nOrDefault()
  if (!delivery) return null

  const t = messages.admin.deliveriesPage
  const failureLog = readRecord(delivery.metadata?.failureLog)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4 pr-8">
            <div className="space-y-2">
              <DialogTitle>{t.dialogTitle}</DialogTitle>
              <DialogDescription>{t.dialogDescription}</DialogDescription>
            </div>
            {onResend ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isResending}
                onClick={onResend}
              >
                {isResending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="mr-2 h-4 w-4" />
                )}
                {t.resend}
              </Button>
            ) : null}
          </div>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <section className="grid gap-3 sm:grid-cols-2">
            <Detail label={t.labels.deliveryId} value={delivery.id} mono />
            <Detail label={t.labels.status} value={delivery.status} />
            <Detail label={t.labels.provider} value={delivery.provider} />
            <Detail
              label={t.labels.providerMessageId}
              value={delivery.providerMessageId ?? "—"}
              mono
            />
            <Detail
              label={t.labels.template}
              value={delivery.templateSlug ?? messages.admin.common.directTemplate}
              mono
            />
            <Detail label={t.labels.channel} value={delivery.channel} />
            <Detail label={t.labels.created} value={formatDateTime(delivery.createdAt)} />
            <Detail
              label={t.labels.failed}
              value={delivery.failedAt ? formatDateTime(delivery.failedAt) : "—"}
            />
            <Detail
              label={t.labels.sent}
              value={delivery.sentAt ? formatDateTime(delivery.sentAt) : "—"}
            />
            <Detail
              label={t.labels.scheduled}
              value={delivery.scheduledFor ? formatDateTime(delivery.scheduledFor) : "—"}
            />
          </section>

          {delivery.errorMessage ? (
            <LogSection title={t.errorMessageTitle} tone="destructive">
              {delivery.errorMessage}
            </LogSection>
          ) : null}

          {failureLog ? (
            <JsonSection title={t.failureLogTitle} value={failureLog} />
          ) : delivery.status === "failed" ? (
            <LogSection title={t.failureLogTitle}>{t.noFailureLog}</LogSection>
          ) : null}

          <section className="grid gap-3 sm:grid-cols-2">
            <Detail label={t.labels.to} value={delivery.toAddress} />
            <Detail label={t.labels.from} value={delivery.fromAddress ?? "—"} />
            <Detail label={t.labels.subject} value={delivery.subject ?? "—"} />
            <Detail label={t.labels.target} value={formatTarget(delivery)} mono />
          </section>

          <JsonSection title={t.payloadDataTitle} value={delivery.payloadData} />
          <JsonSection title={t.metadataTitle} value={delivery.metadata} />
          <BodySection title={t.textBodyTitle} value={delivery.textBody} />
          <BodySection title={t.htmlBodyTitle} value={delivery.htmlBody} />
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="text-muted-foreground text-xs uppercase tracking-wide">{label}</div>
      <div className={`mt-1 break-words text-sm ${mono ? "font-mono" : ""}`}>{value || "—"}</div>
    </div>
  )
}

function LogSection({
  title,
  children,
  tone,
}: {
  title: string
  children: string
  tone?: "destructive"
}) {
  return (
    <section className="space-y-2">
      <h2 className="font-medium text-sm">{title}</h2>
      <pre
        className={`max-h-56 overflow-auto rounded-md border p-3 text-xs ${
          // i18n-literal-ok tailwind utilities keyed off a tone enum, not user-facing copy.
          tone === "destructive" ? "border-destructive/30 bg-destructive/10" : "bg-muted/30"
        }`}
      >
        {children}
      </pre>
    </section>
  )
}

function JsonSection({ title, value }: { title: string; value: unknown }) {
  if (!value) return null
  return <LogSection title={title}>{JSON.stringify(value, null, 2)}</LogSection>
}

function BodySection({ title, value }: { title: string; value: string | null }) {
  if (!value) return null
  return <LogSection title={title}>{value}</LogSection>
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function formatTarget(delivery: NotificationDeliveryRecord) {
  const targetId =
    delivery.bookingId ??
    delivery.invoiceId ??
    delivery.paymentSessionId ??
    delivery.personId ??
    delivery.organizationId ??
    delivery.targetId

  return targetId ? `${delivery.targetType}:${targetId}` : delivery.targetType
}
