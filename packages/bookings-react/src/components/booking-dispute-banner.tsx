"use client"

import { useBookingPaymentDisputes } from "@voyant-travel/finance-react"
import { Badge, cn } from "@voyant-travel/ui/components"
import { AlertTriangle, ShieldCheck } from "lucide-react"

import { useBookingsUiI18nOrDefault, useBookingsUiMessagesOrDefault } from "../i18n/provider.js"

export interface BookingDisputeBannerProps {
  bookingId: string
}

/**
 * A chargeback against this booking's payment (voyant#4289).
 *
 * The rest of the booking keeps saying `paid` — the money was taken, and the
 * payment session records that faithfully. This is the only thing on the page
 * that says the money is being taken back, which is why it renders above the
 * payment panels rather than inside them.
 *
 * Renders nothing when the booking has never been disputed. A booking whose
 * disputes have all resolved gets a quiet note rather than silence: "it was
 * contested and we won" is materially different from "it was never contested",
 * and an operator looking at the money should be able to see which.
 */
export function BookingDisputeBanner({ bookingId }: BookingDisputeBannerProps) {
  const disputesQuery = useBookingPaymentDisputes(bookingId)
  const { formatCurrency, formatDate } = useBookingsUiI18nOrDefault()
  const messages = useBookingsUiMessagesOrDefault().bookingDisputeBanner

  const summary = disputesQuery.data?.data
  if (!summary || summary.disputes.length === 0) return null

  const { hasOpenDispute } = summary
  const contested = Object.entries(summary.openContestedAmountsByCurrency)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, cents]) => formatCurrency(cents / 100, currency))
    .join(" / ")

  return (
    <section
      className={cn(
        "rounded-md border p-4",
        hasOpenDispute
          ? "border-red-300 bg-red-50 text-red-950 dark:border-red-800 dark:bg-red-950/30 dark:text-red-100"
          : "bg-muted/30",
      )}
      aria-live="polite"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          {hasOpenDispute ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
          ) : (
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          )}
          <div>
            <h3 className="font-medium text-sm">
              {hasOpenDispute ? messages.title : messages.resolvedTitle}
            </h3>
            <p className="mt-1 max-w-3xl text-sm opacity-80">
              {hasOpenDispute ? messages.description : messages.resolvedDescription}
            </p>
          </div>
        </div>
        {hasOpenDispute ? (
          <div className="text-right">
            <div className="text-muted-foreground text-xs">{messages.contested}</div>
            <div className="mt-1 font-mono font-semibold text-sm">{contested}</div>
          </div>
        ) : null}
      </div>

      <ul className="mt-4 space-y-2">
        {summary.disputes.map((dispute) => (
          <li
            key={dispute.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2 text-sm first:border-t-0 first:pt-0"
          >
            <Badge variant={isOpen(dispute.status) ? "destructive" : "outline"}>
              {messages.statuses[dispute.status]}
            </Badge>
            <span className="font-mono">
              {formatCurrency(dispute.amountCents / 100, dispute.currency)}
            </span>
            <span className="text-muted-foreground text-xs">
              {formatDate(dispute.openedAt, { dateStyle: "medium" })}
            </span>
            {isOpen(dispute.status) ? (
              <span className="text-muted-foreground text-xs">
                {messages.respondBy}:{" "}
                {dispute.respondBy
                  ? formatDate(dispute.respondBy, { dateStyle: "medium" })
                  : messages.noDeadline}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}

function isOpen(status: string) {
  return status === "opened" || status === "under_review"
}
