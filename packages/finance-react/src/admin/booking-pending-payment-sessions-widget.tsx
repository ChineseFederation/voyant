"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { ColumnDef } from "@tanstack/react-table"
import { useOperatorAdminMessages } from "@voyant-travel/admin"
import { bookingsQueryKeys } from "@voyant-travel/bookings-react"
import type { BookingDetailHostSlotContext } from "@voyant-travel/bookings-react/admin"
import {
  IconActionButton,
  StatusBadge,
  useBookingsUiI18nOrDefault,
} from "@voyant-travel/bookings-react/ui"
import { buildConfiguredPaymentLinkUrl } from "@voyant-travel/finance/payment-link"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@voyant-travel/ui/components"
import { Button } from "@voyant-travel/ui/components/button"
import { DataTable } from "@voyant-travel/ui/components/data-table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@voyant-travel/ui/components/tooltip"
import { Check, Copy, Loader2, Plus, Trash2, Wallet } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"
import {
  financeQueryKeys,
  type PaymentSessionRecord,
  usePaymentSessionMutation,
  usePaymentSessions,
  useVoyantFinanceContext,
} from "../index.js"

type PaymentSessionsMessages = ReturnType<
  typeof useOperatorAdminMessages
>["bookings"]["detail"]["paymentSessions"]

/**
 * Props of the pending payment-sessions widget: exactly the slot context
 * the bookings detail host hands to `booking.details.finance-start` widget
 * contributions (see `bookingDetailFinanceStartSlot` in
 * `@voyant-travel/bookings-react/admin`).
 */
export type BookingPendingPaymentSessionsWidgetProps = BookingDetailHostSlotContext

/**
 * Finance-owned payment-links card for the booking detail page's Finance
 * tab, delivered as a widget contribution on `booking.details.finance-start`
 * (packaged-admin RFC §4.7 cycle resolution: this package depends on
 * `@voyant-travel/bookings-react/ui`, so the bookings host cannot import the card —
 * finance contributes it instead). Lists the booking's pending payment
 * sessions and lets ops copy the public payment link, mark a session paid
 * (manual bank-transfer capture) or cancel it.
 *
 * The copy action resolves the public checkout origin from the
 * starter-level `/v1/public/payment-link-config` route through the shared
 * finance provider context. Missing configuration fails closed.
 */
export function BookingPendingPaymentSessionsWidget({
  booking,
  fullyPaidReason,
  onGenerateLink,
}: BookingPendingPaymentSessionsWidgetProps): React.ReactElement {
  const t = useOperatorAdminMessages().bookings.detail.paymentSessions
  const { formatCurrency, formatDateTime } = useBookingsUiI18nOrDefault()
  const { baseUrl, fetcher } = useVoyantFinanceContext()
  const queryClient = useQueryClient()
  const bookingId = booking.id
  const [cancelTarget, setCancelTarget] = React.useState<PaymentSessionRecord | null>(null)

  const { data } = usePaymentSessions({ bookingId, status: "pending", limit: 10 })
  // Shares the cache entry with `useCheckoutPaymentLinkConfig` from
  // Finance checkout collection uses the same endpoint and query key.
  const { data: paymentLinkConfig } = useQuery({
    queryKey: ["checkout-payment-link-config"],
    queryFn: async (): Promise<{
      paymentLinkUrlTemplate?: string | null
      publicCheckoutBaseUrl?: string | null
    }> => {
      const response = await fetcher(`${baseUrl}/v1/public/payment-link-config`, {
        headers: { Accept: "application/json" },
      })
      if (!response.ok) throw new Error(`config fetch failed: ${response.status}`)
      const body = (await response.json()) as {
        data: {
          paymentLinkUrlTemplate?: string | null
          publicCheckoutBaseUrl?: string | null
        }
      }
      return body.data
    },
    staleTime: 5 * 60 * 1000,
  })

  const { complete, cancel } = usePaymentSessionMutation()

  // The mutation hook already refreshes finance-owned session/payment/
  // invoice lists; refresh the booking-scoped surfaces here.
  const invalidateBookingSurroundings = React.useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: financeQueryKeys.adminBookingPayments(bookingId),
    })
    void queryClient.invalidateQueries({ queryKey: bookingsQueryKeys.booking(bookingId) })
    void queryClient.invalidateQueries({ queryKey: bookingsQueryKeys.actionLedger(bookingId) })
  }, [queryClient, bookingId])

  const completeMutate = complete.mutate
  const markReceived = React.useCallback(
    (sessionId: string) => {
      const now = new Date().toISOString()
      completeMutate(
        {
          id: sessionId,
          input: {
            status: "paid",
            captureMode: "manual",
            paymentMethod: "bank_transfer",
            paymentDate: now,
            authorizedAt: now,
            capturedAt: now,
          },
        },
        { onSuccess: invalidateBookingSurroundings },
      )
    },
    [completeMutate, invalidateBookingSurroundings],
  )

  const cancelSession = (sessionId: string) => {
    cancel.mutate(
      { id: sessionId },
      {
        onSuccess: () => {
          invalidateBookingSurroundings()
          setCancelTarget(null)
        },
      },
    )
  }

  const sessions = data?.data ?? []

  const columns = React.useMemo<ColumnDef<PaymentSessionRecord>[]>(
    () => [
      {
        accessorKey: "createdAt",
        header: t.columnDate,
        cell: ({ row }) => formatDateTime(row.original.createdAt),
      },
      {
        accessorKey: "amountCents",
        header: t.columnAmount,
        cell: ({ row }) => (
          <span className="font-mono font-medium">
            {formatCurrency(row.original.amountCents / 100, row.original.currency)}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: t.columnStatus,
        cell: ({ row }) => (
          <StatusBadge status={row.original.status}>
            {t.statusLabels[row.original.status as keyof typeof t.statusLabels] ??
              row.original.status}
          </StatusBadge>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const session = row.original
          const isMarkingThis = complete.isPending && complete.variables?.id === session.id
          return (
            <div className="flex items-center justify-end gap-1">
              <IconActionButton
                label={t.copyPaymentLink}
                icon={<Copy className="h-3.5 w-3.5" />}
                onClick={() => void copyPaymentLink(session.id, paymentLinkConfig, t)}
              />
              <IconActionButton
                label={t.markReceived}
                icon={
                  isMarkingThis ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )
                }
                disabled={complete.isPending}
                onClick={() => markReceived(session.id)}
              />
              <IconActionButton
                label={t.cancelPaymentLink}
                icon={<Trash2 className="h-3.5 w-3.5" />}
                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setCancelTarget(session)}
              />
            </div>
          )
        },
      },
    ],
    [
      formatCurrency,
      formatDateTime,
      complete.isPending,
      complete.variables,
      markReceived,
      paymentLinkConfig,
      t,
    ],
  )

  return (
    <div data-slot="booking-payment-links" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Wallet className="h-4 w-4" />
          {t.pendingTitle}
        </h2>
        {onGenerateLink ? (
          fullyPaidReason ? (
            <Tooltip>
              {/* biome-ignore lint/a11y/noNoninteractiveTabindex: required so disabled-button tooltips remain keyboard-discoverable  -- owner: finance-react; existing suppression is intentional pending typed cleanup. */}
              <TooltipTrigger render={<span tabIndex={0} className="inline-block" />}>
                <Button variant="outline" size="sm" disabled className="pointer-events-none">
                  <Plus className="mr-2 h-4 w-4" />
                  {t.generatePaymentLink}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{fullyPaidReason}</TooltipContent>
            </Tooltip>
          ) : (
            <Button variant="outline" size="sm" onClick={onGenerateLink}>
              <Plus className="mr-2 h-4 w-4" />
              {t.generatePaymentLink}
            </Button>
          )
        ) : null}
      </div>

      <DataTable columns={columns} data={sessions} emptyMessage={t.empty} showPagination={false} />

      {complete.error ? (
        <p className="text-destructive text-xs">
          {complete.error instanceof Error ? complete.error.message : t.markReceivedFailed}
        </p>
      ) : null}

      <AlertDialog
        open={Boolean(cancelTarget)}
        onOpenChange={(next) => {
          if (!next && !cancel.isPending) setCancelTarget(null)
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t.cancelConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.cancelConfirmDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancel.isPending}>
              {t.cancelConfirmCancel}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={cancel.isPending}
              onClick={() => cancelTarget && cancelSession(cancelTarget.id)}
            >
              {t.cancelConfirmConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

async function copyPaymentLink(
  paymentSessionId: string,
  config:
    | {
        paymentLinkUrlTemplate?: string | null
        publicCheckoutBaseUrl?: string | null
      }
    | undefined,
  messages: PaymentSessionsMessages,
): Promise<void> {
  const url = buildConfiguredPaymentLinkUrl(paymentSessionId, config ?? {})
  if (!url) {
    toast.error(messages.paymentLinkCopyFailed)
    return
  }
  try {
    await navigator.clipboard.writeText(url)
    toast.success(messages.paymentLinkCopied)
  } catch {
    toast.error(messages.paymentLinkCopyFailed)
  }
}
