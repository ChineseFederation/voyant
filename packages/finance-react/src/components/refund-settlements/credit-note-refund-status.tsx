"use client"

import { StatusBadge } from "@voyant-travel/bookings-react/ui"
import { Button } from "@voyant-travel/ui/components"
import { BanknoteArrowDown } from "lucide-react"
import * as React from "react"

import { useFinanceUiI18nOrDefault, useFinanceUiMessagesOrDefault } from "../../i18n/index.js"
import type { RefundSettlementRecord } from "../../schemas.js"
import { RecordRefundSettlementDialog } from "./record-refund-settlement-dialog.js"
import { isOwed, isPaidBack, totalByCurrency } from "./shared.js"

export interface CreditNoteRefundStatusProps {
  creditNoteId: string
  bookingId: string | null | undefined
  amountCents: number
  currency: string
  /** Already fetched for the whole invoice; this row filters, it does not fetch. */
  settlements: readonly RefundSettlementRecord[]
  onRecorded?: () => void
}

/**
 * Whether a credit note has actually been paid (voyant#4303).
 *
 * This is the closing half of the loop the invoice page already opens: the
 * operator issues the credit note here, so "and did the customer get the money?"
 * belongs here too rather than one screen away. Without it the card shows an
 * `issued` badge that reads identically whether or not anybody paid.
 */
export function CreditNoteRefundStatus({
  creditNoteId,
  bookingId,
  amountCents,
  currency,
  settlements,
  onRecorded,
}: CreditNoteRefundStatusProps) {
  const panel = useFinanceUiMessagesOrDefault().bookingRefundPanel
  const { formatCurrency } = useFinanceUiI18nOrDefault()
  const [dialogOpen, setDialogOpen] = React.useState(false)

  const mine = settlements.filter((settlement) => settlement.creditNoteId === creditNoteId)
  const owed = totalByCurrency(mine, isOwed)
  const paid = totalByCurrency(mine, isPaidBack)

  const format = (totals: Record<string, number>) =>
    Object.entries(totals)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([code, cents]) => formatCurrency(cents / 100, code))
      .join(" / ")

  return (
    <>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        {mine.length === 0 ? (
          <span className="text-muted-foreground text-xs">{panel.notRefunded}</span>
        ) : (
          <>
            {/*
              Toned, not neutral: "still owed" is money the operator has not
              sent and "already paid" is money that has landed, and an operator
              scanning a column of credit notes should be able to tell those two
              apart without reading either of them.
            */}
            {Object.keys(owed).length > 0 ? (
              <StatusBadge tone="warning">
                {panel.owed}: {format(owed)}
              </StatusBadge>
            ) : null}
            {Object.keys(paid).length > 0 ? (
              <StatusBadge tone="success">
                {panel.paidBack}: {format(paid)}
              </StatusBadge>
            ) : null}
          </>
        )}
        {bookingId ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => setDialogOpen(true)}
          >
            <BanknoteArrowDown className="size-3.5" aria-hidden="true" />
            {panel.rowRecordAction}
          </Button>
        ) : null}
      </div>

      {bookingId ? (
        <RecordRefundSettlementDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          bookingId={bookingId}
          creditNoteId={creditNoteId}
          defaultCurrency={currency}
          defaultAmountCents={amountCents}
          onRecorded={onRecorded}
        />
      ) : null}
    </>
  )
}
