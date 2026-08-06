"use client"

import { useBookingRefundSettlements } from "@voyant-travel/finance-react"
import { cn } from "@voyant-travel/ui/components"
import { BanknoteArrowDown, CheckCircle2 } from "lucide-react"

import { useBookingsUiI18nOrDefault, useBookingsUiMessagesOrDefault } from "../i18n/provider.js"
import { StatusBadge } from "./status-badge.js"

export interface BookingRefundBannerProps {
  bookingId: string
}

/**
 * A refund this booking owes and has not paid (voyant#4303).
 *
 * The credit note reads exactly the same whether or not the money left, so
 * nothing else on this page can tell an operator that a customer is still
 * waiting to be paid back. That is why this sits above the tabs rather than
 * inside the finance one — the same reason the dispute banner does.
 *
 * Renders nothing when the booking has never had a refund. A booking whose
 * refunds have all been paid gets a quiet confirmation rather than silence:
 * "we refunded them and it landed" is materially different from "we never
 * refunded them", and an operator looking at the money should see which.
 */
export function BookingRefundBanner({ bookingId }: BookingRefundBannerProps) {
  const refundsQuery = useBookingRefundSettlements(bookingId)
  const { formatCurrency, formatDate } = useBookingsUiI18nOrDefault()
  const messages = useBookingsUiMessagesOrDefault().bookingRefundBanner

  const summary = refundsQuery.data?.data
  if (!summary || summary.settlements.length === 0) return null

  const { hasOwedRefund } = summary
  const owed = Object.entries(summary.owedAmountsByCurrency)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, cents]) => formatCurrency(cents / 100, currency))
    .join(" / ")

  return (
    <section
      className={cn(
        "rounded-md border p-4",
        hasOwedRefund
          ? "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
          : "bg-muted/30",
      )}
      aria-live="polite"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          {hasOwedRefund ? (
            <BanknoteArrowDown
              className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
              aria-hidden="true"
            />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          )}
          <div>
            <h3 className="font-medium text-sm">
              {hasOwedRefund ? messages.title : messages.settledTitle}
            </h3>
            <p className="mt-1 max-w-3xl text-sm opacity-80">
              {hasOwedRefund ? messages.description : messages.settledDescription}
            </p>
          </div>
        </div>
        {hasOwedRefund ? (
          <div className="text-right">
            <div className="text-muted-foreground text-xs">{messages.owed}</div>
            <div className="mt-1 font-mono font-semibold text-sm">{owed}</div>
          </div>
        ) : null}
      </div>

      <ul className="mt-4 space-y-2">
        {summary.settlements.map((settlement) => (
          <li
            key={settlement.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2 text-sm first:border-t-0 first:pt-0"
          >
            <StatusBadge status={settlement.status}>
              {messages.statuses[settlement.status]}
            </StatusBadge>
            <span className="font-mono">
              {formatCurrency(settlement.amountCents / 100, settlement.currency)}
            </span>
            <span className="text-muted-foreground text-xs">
              {messages.methods[settlement.method]}
            </span>
            <span className="text-muted-foreground text-xs">
              {formatDate(settlement.initiatedAt, { dateStyle: "medium" })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
