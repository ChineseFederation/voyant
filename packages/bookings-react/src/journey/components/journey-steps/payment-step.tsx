// agent-quality: file-size exception -- owner: bookings-react; existing UI surface stays co-located until a dedicated split preserves behavior and tests.
"use client"

import { Separator } from "@voyant-travel/ui/components"
import { Card, CardContent, CardHeader, CardTitle } from "@voyant-travel/ui/components/card"
import { Checkbox } from "@voyant-travel/ui/components/checkbox"
import { Input } from "@voyant-travel/ui/components/input"
import { Label } from "@voyant-travel/ui/components/label"
import { RadioGroup, RadioGroupItem } from "@voyant-travel/ui/components/radio-group"
import { Textarea } from "@voyant-travel/ui/components/textarea"
import { useEffect, useRef, useState } from "react"
import {
  PaymentScheduleSection,
  type PaymentScheduleValue,
} from "../../../components/payment-schedule-section.js"
import {
  emptyTravelCreditPickerValue,
  TravelCreditPickerSection,
  type TravelCreditPickerValue,
} from "../../../components/travel-credit-picker-section.js"
import { useBookingsUiMessagesOrDefault } from "../../../i18n/index.js"
import { type Draft, setPayment } from "../../lib/draft-state.js"
import {
  paymentScheduleValueToRows,
  rowsToPaymentScheduleValue,
} from "../../lib/payment-schedule.js"
import type {
  PaymentProviderCapabilities,
  PaymentProviderStepRenderProps,
  TravelCreditPickerProps,
} from "../../types.js"
import type { StepCommonProps } from "./shared.js"

// ─────────────────────────────────────────────────────────────────
// Payment
// ─────────────────────────────────────────────────────────────────

export function PaymentStep({
  draft,
  setDraft,
  shape,
  capabilities,
  renderProviderStep,
  surface,
  pricing,
}: StepCommonProps & {
  capabilities: PaymentProviderCapabilities
  renderProviderStep?: (props: PaymentProviderStepRenderProps) => React.ReactNode
  surface?: "admin" | "public"
  /** Live quote total + currency — drives the payment-schedule editor defaults. */
  pricing?: { total: number; currency: string } | null
}): React.ReactElement {
  const messages = useBookingsUiMessagesOrDefault()
  // The descriptor lists what the *engine* supports; capabilities
  // narrow further to what the *deployment* turned on. Both must
  // accept an intent for the user to see it.
  const allowed = shape.paymentIntents.filter((i) => isCapabilityEnabled(i, capabilities))
  const intent = draft.payment.intent

  // Admin simplification: when the only choices are reserve-now (hold) and an
  // online payment link (card), don't make it a radio — the booking is always
  // reserved; a single checkbox decides whether to ALSO send a payment link.
  const simpleHoldCard =
    surface === "admin" &&
    allowed.length > 0 &&
    allowed.includes("hold") &&
    allowed.includes("card") &&
    allowed.every((i) => i === "hold" || i === "card")

  // Snap the draft's intent to a sensible value when the current pick isn't on
  // the list — covers descriptor changes mid-flow (e.g. owned→sourced narrows
  // the list). In checkbox mode the baseline is always "hold". This MUST run in
  // an effect, not during render: `setDraft` updates the parent draft owner,
  // and calling it in the render body triggers React's "Cannot update a
  // component while rendering a different component" warning (and drops frames).
  const allowedKey = allowed.join("|")
  // biome-ignore lint/correctness/useExhaustiveDependencies: snaps only when the allowed set (allowedKey) or current intent changes -- owner: bookings-react
  useEffect(() => {
    if (allowed.length > 0 && !allowed.includes(intent)) {
      // Functional update: merge onto the LATEST draft, not the render-time
      // closure. A sibling effect (PaymentScheduleEditor seeding paymentSchedules)
      // can commit in the same batch; building from a stale `draft` here would
      // clobber those rows.
      setDraft((prev) =>
        setPayment(prev, {
          ...prev.payment,
          intent: (simpleHoldCard ? "hold" : allowed[0]) as never,
        }),
      )
    }
  }, [allowedKey, intent, simpleHoldCard])

  return (
    <Card>
      <CardHeader>
        <CardTitle>{messages.bookingJourney.payment.title}</CardTitle>
      </CardHeader>
      <Separator />
      <CardContent className="space-y-4">
        {allowed.length === 0 ? (
          <p className="text-muted-foreground text-sm">{messages.bookingJourney.payment.empty}</p>
        ) : simpleHoldCard ? (
          // biome-ignore lint/a11y/noLabelWithoutControl: Checkbox renders the control -- owner: bookings-react; existing suppression is intentional pending typed cleanup.
          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-input p-3 text-sm transition-colors hover:bg-muted/50">
            <Checkbox
              id="bj-generate-link"
              checked={intent === "card"}
              onCheckedChange={(v) =>
                setDraft(
                  setPayment(draft, {
                    ...draft.payment,
                    intent: (v === true ? "card" : "hold") as never,
                  }),
                )
              }
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <div className="font-medium">{messages.bookingJourney.payment.generateLinkLabel}</div>
              <div className="text-muted-foreground text-xs">
                {messages.bookingJourney.payment.generateLinkHint}
              </div>
            </div>
          </label>
        ) : (
          <RadioGroup
            value={intent}
            onValueChange={(v) =>
              setDraft(setPayment(draft, { ...draft.payment, intent: v as never }))
            }
            className="grid grid-cols-1 gap-2"
          >
            {allowed.map((i) => {
              const meta = intentMeta(i, messages, surface)
              const selected = i === intent
              return (
                // biome-ignore lint/a11y/noLabelWithoutControl: RadioGroupItem provides the control -- owner: bookings-react; existing suppression is intentional pending typed cleanup.
                <label
                  key={i}
                  className={
                    "flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors " +
                    (selected ? "border-primary bg-primary/5" : "border-input hover:bg-muted/50")
                  }
                >
                  <RadioGroupItem value={i} className="mt-0.5" />
                  <div className="space-y-0.5">
                    <div className="font-medium">{meta.label}</div>
                    <div className="text-muted-foreground text-xs">{meta.description}</div>
                  </div>
                </label>
              )
            })}
          </RadioGroup>
        )}

        {/* Payment schedule (installments) — operator-only; storefront collects
            a single payment. Persisted on `draft.paymentSchedules`, which the
            owned handler forwards to the booking-create endpoint. */}
        {surface !== "public" ? (
          <PaymentScheduleEditor draft={draft} setDraft={setDraft} pricing={pricing} />
        ) : null}

        {intent === "card" ? (
          renderProviderStep ? (
            <div>
              {renderProviderStep({
                intent,
                schedule: draft.payment.schedule,
                capabilities,
              })}
            </div>
          ) : simpleHoldCard ? null : (
            // Most deployments use a redirect-style PSP (Netopia / Stripe
            // Checkout / etc) where the journey hands off to a hosted
            // payment page after the customer accepts the contract. Inline
            // card collection is opt-in via `renderPaymentProviderStep`.
            // In checkbox mode the checkbox hint already explains this.
            <p className="text-muted-foreground text-sm">
              {surface === "admin"
                ? messages.bookingJourney.payment.linkSentAfterConfirm
                : messages.bookingJourney.payment.redirectedAfterConfirm}
            </p>
          )
        ) : null}

        {intent === "bank_transfer" ? <BankTransferDetails capabilities={capabilities} /> : null}

        {intent === "inquiry" ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 text-xs dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
            {messages.bookingJourney.payment.inquiryNotice}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

/**
 * Operator-only payment-schedule editor for the journey. Holds the editor
 * value (`{ mode, installments }`) in local state — stable installment ids
 * survive re-quotes — and syncs it to `draft.paymentSchedules` on every change.
 * Re-initialised from the draft when the step remounts (navigation), preserving
 * any paid-installment metadata via the `notes` round-trip.
 */
function PaymentScheduleEditor({
  draft,
  setDraft,
  pricing,
}: {
  draft: Draft
  setDraft: (next: Draft) => void
  pricing?: { total: number; currency: string } | null
}): React.ReactElement {
  const departureDate = draft.configure.departureDate ?? null
  const [value, setValue] = useState<PaymentScheduleValue>(() =>
    rowsToPaymentScheduleValue(draft.paymentSchedules, departureDate),
  )
  const currency = pricing?.currency ?? ""
  // A manual price override is the booking's real total — schedules must sum
  // to it (booking-create enforces this), so the editor anchors on it.
  const total = draft.priceOverride?.amountCents ?? pricing?.total ?? null

  // Persist the default schedule (a single full-amount payment) to the draft
  // once the total is known — otherwise an operator who never touches the
  // editor commits a booking with NO payment schedule. Seeds once; after that
  // the operator owns it via onChange.
  const seeded = useRef(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: one-shot seed guarded by the ref; reads latest via closure -- owner: bookings-react; existing suppression is intentional pending typed cleanup.
  useEffect(() => {
    if (seeded.current || total == null) return
    if (draft.paymentSchedules && draft.paymentSchedules.length > 0) {
      seeded.current = true
      return
    }
    const rows = paymentScheduleValueToRows(value, currency, total)
    if (rows && rows.length > 0) {
      seeded.current = true
      setDraft({ ...draft, paymentSchedules: rows })
    }
  }, [total, currency])

  return (
    <PaymentScheduleSection
      value={value}
      onChange={(next) => {
        setValue(next)
        setDraft({
          ...draft,
          paymentSchedules: paymentScheduleValueToRows(next, currency, total),
        })
      }}
      totalAmountCents={total ?? undefined}
      departureDate={departureDate}
      currency={currency}
    />
  )
}

/**
 * Operator-only manual price override for the journey. Local string state for
 * the amount field keeps decimal entry smooth; syncs cents to `draft.priceOverride`.
 * The owned handler sends it as `confirmedSellAmountCents` (wins over the quote)
 * with a required reason when it differs from the quoted total.
 */
function PriceOverrideEditor({
  draft,
  setDraft,
  pricing,
}: {
  draft: Draft
  setDraft: (next: Draft) => void
  pricing?: { total: number; currency: string } | null
}): React.ReactElement {
  const messages = useBookingsUiMessagesOrDefault().bookingJourney.review
  const quoteTotal = pricing?.total ?? null
  const currency = pricing?.currency ?? ""
  const override = draft.priceOverride
  const [amount, setAmount] = useState(() =>
    override ? (override.amountCents / 100).toString() : "",
  )

  const setOverride = (next: { amountCents: number; reason: string } | undefined) =>
    setDraft({ ...draft, priceOverride: next })

  const reasonNeeded =
    override != null &&
    quoteTotal != null &&
    override.amountCents !== quoteTotal &&
    override.reason.trim().length === 0

  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <div className="flex items-center gap-2 text-sm">
        <Checkbox
          id="bj-price-override"
          checked={override != null}
          onCheckedChange={(v) => {
            if (v === true) {
              const cents = quoteTotal ?? 0
              setAmount((cents / 100).toString())
              setOverride({ amountCents: cents, reason: "" })
            } else {
              setOverride(undefined)
            }
          }}
        />
        <Label htmlFor="bj-price-override" className="cursor-pointer">
          {messages.priceOverrideToggle}
        </Label>
      </div>
      {override ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="bj-price-override-amount" className="text-xs">
              {messages.priceOverrideAmount}
              {currency ? ` (${currency})` : ""}
            </Label>
            <Input
              id="bj-price-override-amount"
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value)
                const parsed = Number(e.target.value)
                setOverride({
                  amountCents: Number.isFinite(parsed) ? Math.round(parsed * 100) : 0,
                  reason: override.reason,
                })
              }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="bj-price-override-reason" className="text-xs">
              {messages.priceOverrideReason}
            </Label>
            <Textarea
              id="bj-price-override-reason"
              placeholder={messages.priceOverrideReasonPlaceholder}
              value={override.reason}
              onChange={(e) =>
                setOverride({
                  amountCents: override.amountCents,
                  reason: e.target.value,
                })
              }
            />
            {reasonNeeded ? (
              <p className="text-destructive text-xs">{messages.priceOverrideReasonRequired}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * Operator-only Travel Credit editor for the review step. Wraps the shared
 * `TravelCreditPickerSection` (which validates the code against
 * `/v1/public/finance/travel-credits/validate`) and mirrors the picked credit into
 * `draft.travelCreditRedemption` so the owned handler redeems it atomically at
 * commit — matching the standalone create-sheet's behaviour. Redeems the
 * full remaining balance, same as the create-sheet.
 */
function TravelCreditEditor({
  draft,
  setDraft,
  pricing,
  renderTravelCreditPicker,
}: {
  draft: Draft
  setDraft: (next: Draft) => void
  pricing?: { total: number; currency: string } | null
  renderTravelCreditPicker?: (props: TravelCreditPickerProps) => React.ReactNode
}): React.ReactElement {
  const labels = useBookingsUiMessagesOrDefault().bookingCreateDialog.labels
  const [travelCredit, setTravelCredit] = useState<TravelCreditPickerValue>(
    emptyTravelCreditPickerValue,
  )
  // Operator surface: an async search combobox (no need to know the code).
  if (renderTravelCreditPicker) {
    return (
      <>
        {renderTravelCreditPicker({
          value: {
            travelCreditId: draft.travelCreditRedemption?.travelCreditId,
            amountCents: draft.travelCreditRedemption?.amountCents,
          },
          onApply: (picked) => setDraft({ ...draft, travelCreditRedemption: picked ?? undefined }),
          currency: pricing?.currency,
          amountCents: pricing?.total ?? undefined,
        })}
      </>
    )
  }
  return (
    <TravelCreditPickerSection
      value={travelCredit}
      onChange={(next) => {
        setTravelCredit(next)
        const redemption =
          next.picked && next.picked.remainingAmountCents != null
            ? {
                travelCreditId: next.picked.id,
                amountCents: next.picked.remainingAmountCents,
              }
            : undefined
        setDraft({ ...draft, travelCreditRedemption: redemption })
      }}
      currency={pricing?.currency}
      amountCents={pricing?.total ?? undefined}
      labels={{
        heading: labels.travelCreditHeading,
        codePlaceholder: labels.travelCreditCodePlaceholder,
        apply: labels.travelCreditApply,
        clear: labels.travelCreditClear,
        remainingLabel: labels.travelCreditRemainingLabel,
        invalidLabel: labels.travelCreditInvalidLabel,
      }}
    />
  )
}

function BankTransferDetails({
  capabilities,
}: {
  capabilities: PaymentProviderCapabilities
}): React.ReactElement {
  const messages = useBookingsUiMessagesOrDefault()
  const note = capabilities.config?.bankTransferNote
  return (
    <div className="rounded-md border bg-muted/30 p-3 text-sm">
      <p className="font-medium">{messages.bookingJourney.payment.bankTransferInstructions}</p>
      <p className="text-muted-foreground text-xs">
        {typeof note === "string" && note.length > 0
          ? note
          : messages.bookingJourney.payment.bankTransferDefaultNote}
      </p>
    </div>
  )
}

function isCapabilityEnabled(
  intent: "hold" | "card" | "bank_transfer" | "ticket_on_credit" | "inquiry",
  capabilities: PaymentProviderCapabilities,
): boolean {
  switch (intent) {
    case "card":
      return capabilities.acceptsCard
    case "hold":
      return capabilities.acceptsHold
    case "bank_transfer":
      return capabilities.acceptsBankTransfer === true
    case "ticket_on_credit":
      return capabilities.acceptsTicketOnCredit
    case "inquiry":
      return capabilities.acceptsInquiry === true
  }
}

function intentMeta(
  intent: "hold" | "card" | "bank_transfer" | "ticket_on_credit" | "inquiry",
  messages: ReturnType<typeof useBookingsUiMessagesOrDefault>,
  surface?: "admin" | "public",
): {
  label: string
  description: string
} {
  // On the operator surface "card" isn't an instant charge — the operator
  // generates a hosted payment link the customer pays later (Netopia, Stripe
  // Checkout, etc). Use operator-framed copy so it doesn't read as "charged
  // immediately".
  if (intent === "card" && surface === "admin") {
    return {
      label: messages.bookingJourney.payment.cardOperatorLabel,
      description: messages.bookingJourney.payment.cardOperatorDescription,
    }
  }
  return {
    label: messages.bookingJourney.payment.intentLabels[intent],
    description: messages.bookingJourney.payment.intentDescriptions[intent],
  }
}

/**
 * Operator-only PAYMENT-RELATED finalize controls — manual price override and
 * Travel Credit redemption (both change the amount due, so they live in the Payment
 * block). Non-payment finalization (internal notes, document generation) lives
 * in the separate Documents step.
 */
export function FinalizeControls({
  draft,
  setDraft,
  pricing,
  renderTravelCreditPicker,
}: {
  draft: Draft
  setDraft: (next: Draft) => void
  pricing?: { total: number; currency: string } | null
  renderTravelCreditPicker?: (props: TravelCreditPickerProps) => React.ReactNode
}): React.ReactElement {
  return (
    <div className="space-y-4">
      {/* Manual price override — wins over the quote price on commit; a reason
          is required when it differs. */}
      <PriceOverrideEditor draft={draft} setDraft={setDraft} pricing={pricing} />
      {/* Travel Credit is redeemed atomically on commit. */}
      <TravelCreditEditor
        draft={draft}
        setDraft={setDraft}
        pricing={pricing}
        renderTravelCreditPicker={renderTravelCreditPicker}
      />
    </div>
  )
}
