"use client"

import { useOptionUnits, useProductOptions } from "@voyant-travel/inventory-react"
import { type AvailabilitySlotRecord, useSlots } from "@voyant-travel/operations-react/availability"
import {
  Button,
  Input,
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
import { AsyncCombobox } from "@voyant-travel/ui/components/async-combobox"
import { AlertTriangle, Loader2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import type { BookingAmendmentRecord } from "../amendment-schemas.js"
import {
  type RosterPreviewResult,
  useBookingAmendmentFlow,
} from "../hooks/use-booking-amendments.js"
import { useBookingsUiI18nOrDefault, useBookingsUiMessagesOrDefault } from "../i18n/provider.js"
import { formatDepartureLabel, getMoveTargetDepartureSlots } from "./booking-create-utils.js"
import { ProductPickerSection, type ProductPickerValue } from "./product-picker-section.js"

export interface BookingItemAdditionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookingId: string
  bookingRevision: number
  onApplied?: (amendment: BookingAmendmentRecord) => void
}

const UNIT_NONE = "__none__"

export function formatMinorCurrency(
  formatCurrency: (amount: number, currency: string) => string,
  amountCents: number,
  currency: string,
) {
  return formatCurrency(amountCents / 100, currency)
}

/**
 * Add a catalog service to a booking that already exists — the extra
 * excursion or transfer a customer asks for mid-trip.
 *
 * The operator picks *what*, never *how much*: price, name and timing come
 * back from the catalog in the quote, which is also what makes the added
 * line hold real inventory instead of being free text.
 *
 * Supplier-sourced products are not offered here. Adding a service the
 * supplier has never been told about needs a reservation this system cannot
 * make, so the picker stays on owned inventory.
 */
export function BookingItemAdditionDialog({
  open,
  onOpenChange,
  bookingId,
  bookingRevision,
  onApplied,
}: BookingItemAdditionDialogProps) {
  const messages = useBookingsUiMessagesOrDefault().itemAdditionDialog
  const { formatCurrency, formatDate } = useBookingsUiI18nOrDefault()
  const { previewItemAddition, accept, apply } = useBookingAmendmentFlow(bookingId)

  const [product, setProduct] = useState<ProductPickerValue>({ productId: "", optionId: null })
  const [unitId, setUnitId] = useState<string>(UNIT_NONE)
  const [slotId, setSlotId] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
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

  const isSourced = Boolean(product.sourceKind) && product.sourceKind !== "owned"

  const optionsQuery = useProductOptions({
    productId: product.productId || undefined,
    status: "active",
    limit: 100,
    enabled: open && Boolean(product.productId) && !isSourced,
  })
  const resolvedOptionId =
    product.optionId ??
    (optionsQuery.data?.data ?? []).find((option) => option.isDefault)?.id ??
    (optionsQuery.data?.data ?? [])[0]?.id ??
    null
  const unitsQuery = useOptionUnits({
    optionId: resolvedOptionId || undefined,
    limit: 100,
    enabled: open && Boolean(resolvedOptionId) && !isSourced,
  })
  const slotsQuery = useSlots({
    productId: product.productId || undefined,
    status: "open",
    limit: 100,
    enabled: open && Boolean(product.productId) && !isSourced,
  })

  const slots = useMemo(
    () =>
      // Capacity-filtered like the move picker: offering a sold-out
      // departure only to have the server refuse the quote wastes the
      // call the operator is on.
      getMoveTargetDepartureSlots(slotsQuery.data?.data ?? [], {
        nowIso: new Date().toISOString(),
        optionId: product.optionId,
        quantity,
        currentSlotId: null,
      }),
    [slotsQuery.data?.data, product.optionId, quantity],
  )
  const selectedSlot = slots.find((slot) => slot.id === slotId) ?? null

  const units = useMemo(() => unitsQuery.data?.data ?? [], [unitsQuery.data?.data])

  useEffect(() => {
    if (!open) return
    setProduct({ productId: "", optionId: null })
    setUnitId(UNIT_NONE)
    setSlotId(null)
    setQuantity(1)
    setReason("")
    setQuoted(null)
    setBlocked(null)
    setAttempt((value) => value + 1)
  }, [open])

  const canQuote =
    Boolean(product.productId) && !isSourced && quantity > 0 && reason.trim().length > 0

  /**
   * Why the quote button is disabled, in the operator's words.
   *
   * A dead button with no explanation is the same as a broken one: the
   * reason field is required but nothing on the form said so, so the sheet
   * looked like it had failed rather than like it was waiting.
   */
  const missing = !product.productId
    ? messages.missing.product
    : isSourced
      ? null
      : reason.trim().length === 0
        ? messages.missing.reason
        : null

  async function onQuote() {
    setBlocked(null)
    setFailed(null)
    let result: RosterPreviewResult
    try {
      result = await previewItemAddition.mutateAsync({
        input: {
          expectedBookingRevision: bookingRevision,
          reason: reason.trim(),
          addition: {
            type: "item_add",
            productId: product.productId,
            optionId: resolvedOptionId,
            optionUnitId: unitId === UNIT_NONE ? null : unitId,
            availabilitySlotId: slotId,
            quantity,
          },
        },
        idempotencyKey: `item-add-${bookingId}-${attempt}`,
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
    const key = `item-add-apply-${quoted.id}`
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

  const busy = previewItemAddition.isPending || accept.isPending || apply.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="lg">
        <SheetHeader>
          <SheetTitle>{messages.title}</SheetTitle>
        </SheetHeader>

        <SheetBody className="grid gap-5">
          <ProductPickerSection
            value={product}
            onChange={(next) => {
              setProduct(next)
              setUnitId(UNIT_NONE)
              setSlotId(null)
              setQuoted(null)
            }}
            enabled={open}
          />

          {isSourced ? (
            <Notice text={messages.sourcedUnsupported} />
          ) : (
            <>
              {slots.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <Label>{messages.fields.departure}</Label>
                  <AsyncCombobox<AvailabilitySlotRecord>
                    value={slotId}
                    onChange={(next) => setSlotId(next)}
                    items={slots}
                    selectedItem={selectedSlot}
                    getKey={(slot) => slot.id}
                    getLabel={(slot) => formatDepartureLabel(slot, formatDate, messages)}
                    placeholder={messages.fields.departurePlaceholder}
                    emptyText={messages.fields.departureEmpty}
                    triggerClassName="w-full"
                    clearable
                  />
                </div>
              ) : null}

              {units.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <Label>{messages.fields.unit}</Label>
                  <Select value={unitId} onValueChange={(next) => setUnitId(next ?? UNIT_NONE)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNIT_NONE}>{messages.fields.unitNone}</SelectItem>
                      {units.map((unit) => (
                        <SelectItem key={unit.id} value={unit.id}>
                          {unit.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              <div className="flex flex-col gap-2">
                <Label htmlFor="item-add-quantity">{messages.fields.quantity}</Label>
                <Input
                  id="item-add-quantity"
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(event) => setQuantity(Number(event.target.value) || 1)}
                />
              </div>
            </>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="item-add-reason">
              {messages.fields.reason} <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="item-add-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={messages.fields.reasonPlaceholder}
            />
          </div>

          {failed ? <Notice text={failed} /> : null}
          {blocked ? <Notice text={blockedText(blocked, messages.blocked)} /> : null}

          {quoted ? (
            <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-4">
              <div className="flex items-baseline justify-between">
                <span className="font-medium text-sm">{messages.quote.title}</span>
                <span className="font-semibold text-lg">
                  {formatMinorCurrency(
                    formatCurrency,
                    quoted.priceDelta.amountCents,
                    quoted.priceDelta.currency,
                  )}
                </span>
              </div>
              {quoted.priceDelta.collectionAmountCents > 0 ? (
                <p className="text-muted-foreground text-xs">
                  {messages.quote.collect.replace(
                    "{amount}",
                    formatMinorCurrency(
                      formatCurrency,
                      quoted.priceDelta.collectionAmountCents,
                      quoted.priceDelta.currency,
                    ),
                  )}
                </p>
              ) : null}
            </div>
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
