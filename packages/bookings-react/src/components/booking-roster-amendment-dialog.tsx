"use client"

import { useQueries } from "@tanstack/react-query"
import {
  Button,
  Checkbox,
  Input,
  Label,
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Textarea,
} from "@voyant-travel/ui/components"
import { AlertTriangle, Loader2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import type { BookingAmendmentRecord } from "../amendment-schemas.js"
import {
  type RosterPreviewResult,
  type TravelerRosterChangeInput,
  useBookingAmendmentFlow,
} from "../hooks/use-booking-amendments.js"
import { useBookingItems } from "../hooks/use-booking-items.js"
import { useTravelers } from "../hooks/use-travelers.js"
import { useBookingsUiMessagesOrDefault } from "../i18n/provider.js"
import { useVoyantBookingsContext } from "../provider.js"
import { getBookingItemTravelersQueryOptions } from "../query-options.js"

export interface BookingRosterAmendmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookingId: string
  bookingRevision: number
  /** `add` collects a new traveller; `drop` removes an existing one. */
  mode: "add" | "drop"
  /** Pre-selected traveller for `drop`. */
  travelerId?: string
  onApplied?: (amendment: BookingAmendmentRecord) => void
}

/**
 * Quote-then-commit flow for adding or removing a traveller on a confirmed
 * booking.
 *
 * The engine behind it prices the change, checks the departure still has
 * room, and asks the supplier when the inventory is sourced — so the
 * operator's job is to describe the change, read the consequences, and
 * decide. Nothing is written until Apply.
 */
export function BookingRosterAmendmentDialog({
  open,
  onOpenChange,
  bookingId,
  bookingRevision,
  mode,
  travelerId,
  onApplied,
}: BookingRosterAmendmentDialogProps) {
  const messages = useBookingsUiMessagesOrDefault().rosterAmendmentDialog
  const { baseUrl, fetcher } = useVoyantBookingsContext()
  const { previewRosterChange: preview, accept, apply } = useBookingAmendmentFlow(bookingId)
  const itemsQuery = useBookingItems(bookingId, { enabled: open })
  const travelersQuery = useTravelers(bookingId, { enabled: open })

  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([])
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [reason, setReason] = useState("")
  const [quoted, setQuoted] = useState<BookingAmendmentRecord | null>(null)
  const [blocked, setBlocked] = useState<RosterPreviewResult | null>(null)
  const [attempt, setAttempt] = useState(0)

  const items = useMemo(
    () => (itemsQuery.data?.data ?? []).filter((item) => item.status === "confirmed"),
    [itemsQuery.data],
  )

  /**
   * Which travellers sit on each item. Needed because dropping someone
   * must cover *exactly* the items they are assigned to — the engine
   * rejects a partial set — so that selection is derived, never chosen.
   *
   * The assignment lives on a per-item endpoint, hence the fan-out.
   */
  const itemTravelerQueries = useQueries({
    queries: items.map((item) => ({
      ...getBookingItemTravelersQueryOptions({ baseUrl, fetcher }, bookingId, item.id),
      enabled: open && mode === "drop",
    })),
    combine: (results) => results.map((result) => result.data?.data ?? []),
  })

  const travelerItemIds = useMemo(() => {
    if (mode !== "drop" || !travelerId) return []
    return items
      .filter((_item, index) =>
        (itemTravelerQueries[index] ?? []).some((link) => link.travelerId === travelerId),
      )
      .map((item) => item.id)
  }, [mode, travelerId, items, itemTravelerQueries])

  useEffect(() => {
    if (!open) return
    setSelectedItemIds(mode === "drop" ? travelerItemIds : items.map((item) => item.id))
    setFirstName("")
    setLastName("")
    setEmail("")
    setReason("")
    setQuoted(null)
    setBlocked(null)
    setAttempt((value) => value + 1)
  }, [open, mode, items, travelerItemIds])

  const droppedTraveler = travelersQuery.data?.data.find((traveler) => traveler.id === travelerId)

  const change: TravelerRosterChangeInput | null =
    mode === "add"
      ? firstName.trim() && lastName.trim()
        ? {
            type: "traveler_add",
            bookingItemIds: selectedItemIds,
            traveler: {
              participantType: "traveler",
              firstName: firstName.trim(),
              lastName: lastName.trim(),
              email: email.trim() || null,
            },
          }
        : null
      : travelerId
        ? { type: "traveler_drop", bookingItemIds: selectedItemIds, travelerId }
        : null

  const canQuote = Boolean(change) && selectedItemIds.length > 0 && reason.trim().length > 0

  async function onQuote() {
    if (!change) return
    setBlocked(null)
    const result = await preview.mutateAsync({
      input: {
        expectedBookingRevision: bookingRevision,
        reason: reason.trim(),
        change,
      },
      idempotencyKey: `roster-${bookingId}-${mode}-${attempt}`,
    })
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
    const key = `roster-apply-${quoted.id}`
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

  const busy = preview.isPending || accept.isPending || apply.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="lg">
        <SheetHeader>
          <SheetTitle>{mode === "add" ? messages.titles.add : messages.titles.drop}</SheetTitle>
        </SheetHeader>

        <SheetBody className="grid gap-5">
          {mode === "add" ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="roster-first-name">{messages.fields.firstName}</Label>
                <Input
                  id="roster-first-name"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="roster-last-name">{messages.fields.lastName}</Label>
                <Input
                  id="roster-last-name"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="roster-email">{messages.fields.email}</Label>
                <Input
                  id="roster-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
            </div>
          ) : (
            <p className="text-sm">
              {droppedTraveler
                ? `${droppedTraveler.firstName} ${droppedTraveler.lastName}`
                : messages.fields.unknownTraveler}
            </p>
          )}

          <div className="flex flex-col gap-2">
            <Label>{messages.fields.items}</Label>
            <p className="text-muted-foreground text-xs">{messages.fields.itemsHint}</p>
            <div className="flex flex-col gap-2 rounded-md border p-3">
              {items.map((item) => (
                <div key={item.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    id={`roster-item-${item.id}`}
                    checked={selectedItemIds.includes(item.id)}
                    disabled={mode === "drop"}
                    onCheckedChange={(checked) =>
                      setSelectedItemIds((current) =>
                        checked
                          ? [...current, item.id]
                          : current.filter((value) => value !== item.id),
                      )
                    }
                  />
                  <Label htmlFor={`roster-item-${item.id}`} className="font-normal">
                    {item.productNameSnapshot ?? item.title}
                  </Label>
                </div>
              ))}
              {items.length === 0 ? (
                <span className="text-muted-foreground text-sm">{messages.fields.noItems}</span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="roster-reason">{messages.fields.reason}</Label>
            <Textarea
              id="roster-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={messages.fields.reasonPlaceholder}
            />
          </div>

          {blocked ? <BlockedNotice result={blocked} /> : null}
          {quoted ? <QuotePanel amendment={quoted} /> : null}
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
            <Button type="button" size="sm" disabled={!canQuote || busy} onClick={onQuote}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {messages.actions.quote}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

/**
 * A preview that produced no amendment. Each of these is a real answer
 * about the booking, so each gets its own sentence rather than a generic
 * failure.
 */
function BlockedNotice({ result }: { result: RosterPreviewResult }) {
  const messages = useBookingsUiMessagesOrDefault().rosterAmendmentDialog
  const text =
    result.status === "no_op"
      ? messages.blocked.noOp
      : result.status === "availability_changed"
        ? messages.blocked.availabilityChanged
        : result.status === "unsupported_configuration"
          ? (result.reason ?? messages.blocked.unsupported)
          : result.status === "stale_revision"
            ? messages.blocked.staleRevision
            : messages.blocked.generic

  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <span>{text}</span>
    </div>
  )
}

/** What the change costs and what it will set in motion. */
function QuotePanel({ amendment }: { amendment: BookingAmendmentRecord }) {
  const messages = useBookingsUiMessagesOrDefault().rosterAmendmentDialog
  const price = amendment.priceDelta
  const money = (cents: number) => `${(cents / 100).toFixed(2)} ${price.currency}`

  const consequences: string[] = []
  if (price.collectionAmountCents > 0) {
    consequences.push(
      messages.consequences.collect.replace("{amount}", money(price.collectionAmountCents)),
    )
  }
  if (price.refundAmountCents > 0) {
    consequences.push(
      messages.consequences.refund.replace("{amount}", money(price.refundAmountCents)),
    )
  }
  if (amendment.effects.supplier === "modify_required") {
    consequences.push(messages.consequences.supplier)
  }
  if (amendment.effects.documents === "reissue_required") {
    consequences.push(messages.consequences.documents)
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border bg-muted/30 p-4">
      <div className="flex items-baseline justify-between">
        <span className="font-medium text-sm">{messages.quote.title}</span>
        <span className="font-semibold text-lg">{money(price.amountCents)}</span>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <dt className="text-muted-foreground">{messages.quote.subtotal}</dt>
        <dd className="text-right">{money(price.subtotalDeltaCents)}</dd>
        <dt className="text-muted-foreground">{messages.quote.tax}</dt>
        <dd className="text-right">{money(price.taxDeltaCents)}</dd>
      </dl>
      {consequences.length > 0 ? (
        <ul className="list-inside list-disc text-muted-foreground text-xs">
          {consequences.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
