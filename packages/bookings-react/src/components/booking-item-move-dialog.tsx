"use client"

import { useSlots } from "@voyant-travel/operations-react/availability"
import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Textarea,
} from "@voyant-travel/ui/components"
import { CurrencyInput } from "@voyant-travel/ui/components/currency-input"
import { AlertTriangle, Loader2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import type { BookingAmendmentRecord } from "../amendment-schemas.js"
import {
  type RosterPreviewResult,
  useBookingAmendmentFlow,
} from "../hooks/use-booking-amendments.js"
import { useBookingsUiI18nOrDefault, useBookingsUiMessagesOrDefault } from "../i18n/provider.js"
import type { BookingItemRecord } from "../schemas.js"
import { formatDepartureLabel, getMoveTargetDepartureSlots } from "./booking-create-utils.js"

export interface BookingItemMoveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookingId: string
  bookingRevision: number
  /** The service being moved. */
  item: BookingItemRecord
  onApplied?: (amendment: BookingAmendmentRecord) => void
}

type RefundHandling = "refund" | "travel_credit" | "waive"

/**
 * Move one service to a different departure.
 *
 * The target is a **selector over real departures**, never a free date
 * field: only departures of this product that are open, in the future, and
 * have room for the seats being carried are offered. A date the operator
 * cannot actually move onto is not a choice, and letting them pick one only
 * to have the server refuse it wastes the call they are on.
 *
 * Price is never typed. The new fare comes back from the catalog for the
 * chosen date; the only number the operator sets is the change fee.
 */
export function BookingItemMoveDialog({
  open,
  onOpenChange,
  bookingId,
  bookingRevision,
  item,
  onApplied,
}: BookingItemMoveDialogProps) {
  const messages = useBookingsUiMessagesOrDefault().itemMoveDialog
  const { formatCurrency, formatDate } = useBookingsUiI18nOrDefault()
  const { previewItemMove, accept, apply } = useBookingAmendmentFlow(bookingId)

  const [slotId, setSlotId] = useState<string | null>(null)
  const [changeFeeCents, setChangeFeeCents] = useState<number>(0)
  const [fareDiscountCents, setFareDiscountCents] = useState<number>(0)
  const [refundHandling, setRefundHandling] = useState<RefundHandling>("refund")
  const [reason, setReason] = useState("")
  const [quoted, setQuoted] = useState<BookingAmendmentRecord | null>(null)
  const [blocked, setBlocked] = useState<RosterPreviewResult | null>(null)
  /**
   * A request that never returned an answer at all. Distinct from
   * `blocked`, which is the server telling us why it will not quote —
   * without this, a failed call left the sheet looking untouched.
   */
  const [failed, setFailed] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  const slotsQuery = useSlots({
    productId: item.productId || undefined,
    status: "open",
    limit: 100,
    enabled: open && Boolean(item.productId),
  })

  const slots = useMemo(
    () =>
      getMoveTargetDepartureSlots(slotsQuery.data?.data ?? [], {
        nowIso: new Date().toISOString(),
        optionId: item.optionId,
        quantity: item.quantity,
        currentSlotId: item.availabilitySlotId,
      }),
    [slotsQuery.data?.data, item.optionId, item.quantity, item.availabilitySlotId],
  )

  useEffect(() => {
    if (!open) return
    setSlotId(null)
    setChangeFeeCents(0)
    setFareDiscountCents(0)
    setRefundHandling("refund")
    setReason("")
    setQuoted(null)
    setBlocked(null)
    setAttempt((value) => value + 1)
  }, [open])

  const canQuote = Boolean(slotId) && reason.trim().length > 0

  /** Why the quote button is disabled, said plainly rather than implied. */
  const missing = !slotId
    ? messages.missing.departure
    : reason.trim().length === 0
      ? messages.missing.reason
      : null

  async function onQuote() {
    if (!slotId) return
    setBlocked(null)
    setFailed(null)
    let result: RosterPreviewResult
    try {
      result = await previewItemMove.mutateAsync({
        input: {
          expectedBookingRevision: bookingRevision,
          reason: reason.trim(),
          move: {
            type: "item_move",
            bookingItemId: item.id,
            availabilitySlotId: slotId,
            changeFeeCents,
            fareDiscountCents,
            refundHandling,
          },
        },
        idempotencyKey: `item-move-${item.id}-${attempt}`,
      })
    } catch (error) {
      // The request never produced an answer — a 500, a dropped
      // connection. Saying so beats a button that flashes and leaves the
      // sheet looking untouched.
      setFailed(error instanceof Error ? error.message : messages.blocked.generic)
      return
    }
    if (result.status === "ok") {
      setQuoted(result.amendment)
      return
    }
    setBlocked(result)
  }

  async function onApply() {
    if (!quoted) return
    const proposed = quoted.revisions?.find((revision) => revision.role === "proposed_after")
    if (!proposed) return
    const key = `item-move-apply-${quoted.id}`
    if (quoted.acceptanceRequired && quoted.status === "proposed") {
      await accept.mutateAsync({
        amendmentId: quoted.id,
        proposedRevisionId: proposed.id,
        idempotencyKey: `${key}-accept`,
      })
    }
    const applied = await apply.mutateAsync({
      amendmentId: quoted.id,
      proposedRevisionId: proposed.id,
      expectedBookingRevision: quoted.baseBookingRevision,
      idempotencyKey: key,
    })
    onApplied?.(applied)
    onOpenChange(false)
  }

  const busy = previewItemMove.isPending || accept.isPending || apply.isPending
  const noTargets = !slotsQuery.isPending && slots.length === 0

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="lg">
        <SheetHeader>
          <SheetTitle>{messages.title}</SheetTitle>
        </SheetHeader>

        <SheetBody className="grid gap-5">
          <div className="flex flex-col gap-1 rounded-md border bg-muted/30 p-3 text-sm">
            <span className="font-medium">{item.productNameSnapshot ?? item.title}</span>
            <span className="text-muted-foreground text-xs">
              {item.departureLabelSnapshot ?? item.serviceDate ?? messages.currentUnscheduled}
            </span>
          </div>

          {noTargets ? (
            <Notice text={messages.noTargets} />
          ) : (
            <div className="flex flex-col gap-2">
              <Label htmlFor="move-departure">{messages.fields.departure}</Label>
              <Select
                value={slotId ?? ""}
                onValueChange={(next) => {
                  setSlotId(next ?? null)
                  setQuoted(null)
                }}
              >
                <SelectTrigger id="move-departure" className="w-full">
                  <SelectValue placeholder={messages.fields.departurePlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {slots.map((slot) => (
                    <SelectItem key={slot.id} value={slot.id}>
                      {formatDepartureLabel(slot, formatDate, messages)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">{messages.fields.departureHint}</p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="move-fee">{messages.fields.changeFee}</Label>
            <CurrencyInput
              id="move-fee"
              value={changeFeeCents}
              onChange={(next) => {
                setChangeFeeCents(next ?? 0)
                setQuoted(null)
              }}
              currency={item.sellCurrency}
            />
            <p className="text-muted-foreground text-xs">{messages.fields.changeFeeHint}</p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="move-discount">{messages.fields.fareDiscount}</Label>
            <CurrencyInput
              id="move-discount"
              value={fareDiscountCents}
              onChange={(next) => {
                setFareDiscountCents(next ?? 0)
                setQuoted(null)
              }}
              currency={item.sellCurrency}
            />
            <p className="text-muted-foreground text-xs">{messages.fields.fareDiscountHint}</p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="move-refund-handling">{messages.fields.refundHandling}</Label>
            <Select
              value={refundHandling}
              onValueChange={(next) => {
                setRefundHandling((next as RefundHandling) ?? "refund")
                setQuoted(null)
              }}
            >
              <SelectTrigger id="move-refund-handling" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="refund">{messages.refundHandling.refund}</SelectItem>
                <SelectItem value="travel_credit">
                  {messages.refundHandling.travelCredit}
                </SelectItem>
                <SelectItem value="waive">{messages.refundHandling.waive}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">{messages.fields.refundHandlingHint}</p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="move-reason">
              {messages.fields.reason} <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="move-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={messages.fields.reasonPlaceholder}
            />
          </div>

          {failed ? <Notice text={failed} /> : null}
          {blocked ? <Notice text={blockedText(blocked, messages.blocked)} /> : null}
          {quoted ? (
            <MoveQuote
              amendment={quoted}
              formatCurrency={formatCurrency}
              requestedDiscountCents={fareDiscountCents}
            />
          ) : null}
        </SheetBody>

        <SheetFooter>
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {messages.actions.cancel}
          </Button>
          {quoted ? (
            <Button type="button" size="sm" disabled={busy} onClick={onApply}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {messages.actions.apply}
            </Button>
          ) : (
            <>
              {missing ? (
                <span className="mr-auto text-muted-foreground text-xs">{missing}</span>
              ) : null}
              <Button type="button" size="sm" disabled={!canQuote || busy} onClick={onQuote}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {messages.actions.quote}
              </Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

/**
 * The two halves of the price, kept apart on purpose: an operator reading
 * this back to a customer needs to say "the new date is X more, plus our Y
 * change fee", not a single blended number.
 */
function MoveQuote({
  amendment,
  formatCurrency,
  requestedDiscountCents,
}: {
  amendment: BookingAmendmentRecord
  formatCurrency: (cents: number, currency: string) => string
  requestedDiscountCents: number
}) {
  const messages = useBookingsUiMessagesOrDefault().itemMoveDialog
  const price = amendment.priceDelta
  const money = (cents: number) => formatCurrency(cents, price.currency)

  return (
    <div className="flex flex-col gap-3 rounded-md border bg-muted/30 p-4">
      <div className="flex items-baseline justify-between">
        <span className="font-medium text-sm">{messages.quote.title}</span>
        <span className="font-semibold text-lg">{money(price.amountCents)}</span>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <dt className="text-muted-foreground">{messages.quote.fareDifference}</dt>
        <dd className="text-right">{money(price.subtotalDeltaCents)}</dd>
        <dt className="text-muted-foreground">{messages.quote.changeFee}</dt>
        <dd className="text-right">{money(price.feeDeltaCents)}</dd>
        {price.taxDeltaCents !== 0 ? (
          <>
            <dt className="text-muted-foreground">{messages.quote.tax}</dt>
            <dd className="text-right">{money(price.taxDeltaCents)}</dd>
          </>
        ) : null}
      </dl>
      {requestedDiscountCents > 0 ? (
        <p className="text-muted-foreground text-xs">{messages.quote.discountApplied}</p>
      ) : null}
      <ul className="list-inside list-disc text-muted-foreground text-xs">
        {price.collectionAmountCents > 0 ? (
          <li>{messages.quote.collect.replace("{amount}", money(price.collectionAmountCents))}</li>
        ) : null}
        {price.refundAmountCents > 0 ? (
          <li>{messages.quote.owedBack.replace("{amount}", money(price.refundAmountCents))}</li>
        ) : null}
        {amendment.effects.supplier === "modify_required" ? (
          <li>{messages.quote.supplier}</li>
        ) : null}
        {amendment.effects.documents === "reissue_required" ? (
          <li>{messages.quote.documents}</li>
        ) : null}
      </ul>
    </div>
  )
}

function blockedText(
  result: RosterPreviewResult,
  messages: {
    availabilityChanged: string
    unsupported: string
    staleRevision: string
    generic: string
  },
): string {
  if (result.status === "availability_changed") return messages.availabilityChanged
  if (result.status === "unsupported_configuration") return result.reason ?? messages.unsupported
  if (result.status === "stale_revision") return messages.staleRevision
  return messages.generic
}

function Notice({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <span>{text}</span>
    </div>
  )
}
