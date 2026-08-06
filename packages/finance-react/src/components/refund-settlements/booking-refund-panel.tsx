"use client"

import { StatusBadge } from "@voyant-travel/bookings-react/ui"
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@voyant-travel/ui/components"
import { cn } from "@voyant-travel/ui/lib/utils"
import { BanknoteArrowDown, Loader2, MoreHorizontal, Send } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { useFinanceUiI18nOrDefault, useFinanceUiMessagesOrDefault } from "../../i18n/index.js"
import { useBookingRefundSettlements, useRefundSettlementMutation } from "../../index.js"
import type { RefundSettlementRecord } from "../../schemas.js"
import { LoadingRow, Money } from "../invoice-detail-page/primitives.js"
import { RecordRefundSettlementDialog } from "./record-refund-settlement-dialog.js"
import { isAdapterBackedMethod, isOwed } from "./shared.js"

export interface BookingRefundPanelProps {
  bookingId: string
  className?: string
}

/**
 * Booking → Finance → how the customer was paid back (voyant#4303).
 *
 * Sits directly under the payments summary: money out belongs next to money in,
 * and an operator asking "did we refund them?" should not have to know that the
 * answer lives somewhere else.
 *
 * The two totals at the top are the whole point of the panel. **Still owed** is
 * what the credit note cannot tell you, and it is the number an operator is
 * accountable for.
 */
export function BookingRefundPanel({ bookingId, className }: BookingRefundPanelProps) {
  const messages = useFinanceUiMessagesOrDefault()
  const panel = messages.bookingRefundPanel
  const { formatCurrency, formatDate } = useFinanceUiI18nOrDefault()

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const refundsQuery = useBookingRefundSettlements(bookingId)
  const { update, execute } = useRefundSettlementMutation()

  const summary = refundsQuery.data?.data
  const settlements = summary?.settlements ?? []

  const advance = async (settlement: RefundSettlementRecord, status: "settled" | "failed") => {
    try {
      await update.mutateAsync({ id: settlement.id, input: { status } })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : panel.title)
    }
  }

  const send = async (settlement: RefundSettlementRecord) => {
    try {
      const result = await execute.mutateAsync(settlement.id)
      // The outcome is the message. `indeterminate` in particular is not a
      // failure toast — it is an instruction, because the money may have moved.
      const description = panel.outcomes[result.outcome]
      if (result.outcome === "settled") toast.success(description)
      else if (result.outcome === "failed") toast.error(description)
      else toast.warning(description)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : panel.title)
    }
  }

  return (
    <>
      <div data-slot="booking-refund-panel" className={cn("flex flex-col gap-3", className)}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-semibold text-base">
            <BanknoteArrowDown className="h-4 w-4" aria-hidden="true" />
            {panel.title}
          </h2>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <BanknoteArrowDown className="size-4" aria-hidden="true" />
            {panel.recordAction}
          </Button>
        </div>
        {refundsQuery.isLoading ? (
          <div className="rounded-md border">
            <LoadingRow />
          </div>
        ) : settlements.length === 0 ? (
          /*
            The empty state carries the action too. The header button is easy
            to miss on a page this dense, and the middle of an empty panel is
            where the eye actually lands.
          */
          <div className="flex flex-col items-center gap-3 rounded-md border py-8 text-center">
            <BanknoteArrowDown className="size-6 text-muted-foreground" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-medium text-sm">{panel.empty}</p>
              <p className="mx-auto max-w-md text-muted-foreground text-xs">{panel.description}</p>
            </div>
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <BanknoteArrowDown className="size-4" aria-hidden="true" />
              {panel.recordAction}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <SummaryTile
                label={panel.owed}
                amounts={summary?.owedAmountsByCurrency ?? {}}
                tone="warning"
                formatCurrency={formatCurrency}
              />
              <SummaryTile
                label={panel.paidBack}
                amounts={summary?.settledAmountsByCurrency ?? {}}
                tone="success"
                formatCurrency={formatCurrency}
              />
            </div>

            <ul className="divide-y rounded-md border">
              {settlements.map((settlement) => (
                <li
                  key={settlement.id}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm">
                        {panel.methods[settlement.method]}
                      </span>
                      <StatusBadge status={settlement.status}>
                        {panel.statuses[settlement.status]}
                      </StatusBadge>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {formatDate(settlement.initiatedAt, { dateStyle: "medium" })}
                      {" · "}
                      {panel.reference}:{" "}
                      {settlement.externalReference ?? settlement.processorReference ?? (
                        <span className="italic">{panel.noReference}</span>
                      )}
                    </p>
                    {settlement.failureReason ? (
                      <p className="max-w-xl text-amber-700 text-xs dark:text-amber-400">
                        {settlement.failureReason}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <Money cents={settlement.amountCents} currency={settlement.currency} />
                      {/* The uplift case: a voucher worth more than the refund
                          is not an accounting identity, so both numbers show. */}
                      {settlement.instrumentAmountCents != null &&
                      settlement.instrumentCurrency != null ? (
                        <p className="text-muted-foreground text-xs">
                          {panel.instrumentWorth}:{" "}
                          {formatCurrency(
                            settlement.instrumentAmountCents / 100,
                            settlement.instrumentCurrency,
                          )}
                        </p>
                      ) : null}
                    </div>

                    {isOwed(settlement) ? (
                      <div className="flex items-center gap-1">
                        {isAdapterBackedMethod(settlement.method) ? (
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="outline"
                                  className="size-8"
                                  disabled={execute.isPending}
                                  onClick={() => void send(settlement)}
                                />
                              }
                            >
                              {execute.isPending ? (
                                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                              ) : (
                                <Send className="size-4" aria-hidden="true" />
                              )}
                              <span className="sr-only">{panel.executeAction}</span>
                            </TooltipTrigger>
                            <TooltipContent>{panel.executeHint}</TooltipContent>
                          </Tooltip>
                        ) : null}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-8 text-muted-foreground"
                              disabled={update.isPending}
                            >
                              <MoreHorizontal className="size-4" aria-hidden="true" />
                              <span className="sr-only">{panel.rowActions}</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => void advance(settlement, "settled")}>
                              {panel.settleAction}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => void advance(settlement, "failed")}>
                              {panel.failAction}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <RecordRefundSettlementDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        bookingId={bookingId}
        onRecorded={() => void refundsQuery.refetch()}
      />
    </>
  )
}

/**
 * The two figures the panel exists for.
 *
 * They carry the same tones as the status badges below them — "still owed" is
 * the warning tone, "already paid" the success one — so the summary and the
 * rows are saying the same thing in the same color rather than each inventing
 * its own.
 */
function SummaryTile({
  label,
  amounts,
  tone,
  formatCurrency,
}: {
  label: string
  amounts: Record<string, number>
  tone: "warning" | "success"
  formatCurrency: (value: number, currency: string) => string
}) {
  const entries = Object.entries(amounts).sort(([left], [right]) => left.localeCompare(right))
  const toned = entries.length > 0

  return (
    <div
      className={cn(
        "rounded-md border px-4 py-3",
        !toned && "bg-muted/20",
        toned && tone === "warning" && "border-transparent bg-yellow-500/10",
        toned && tone === "success" && "border-transparent bg-green-500/10",
      )}
    >
      <p className="text-muted-foreground text-xs uppercase tracking-wide">{label}</p>
      <p
        className={cn(
          "mt-1 font-mono font-semibold text-sm",
          toned && tone === "warning" && "text-yellow-700 dark:text-yellow-400",
          toned && tone === "success" && "text-green-600 dark:text-green-400",
        )}
      >
        {entries.length === 0
          ? // i18n-literal-ok: an em dash for "nothing here", not translatable text
            "—"
          : entries.map(([currency, cents]) => formatCurrency(cents / 100, currency)).join(" / ")}
      </p>
    </div>
  )
}
