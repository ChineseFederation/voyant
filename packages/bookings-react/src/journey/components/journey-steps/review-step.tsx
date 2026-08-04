"use client"

import type { BookingRequirementsV1 } from "@voyant-travel/catalog-contracts/booking-engine/requirements-contracts"
import type { UnsatisfiedRequirementV1 } from "@voyant-travel/catalog-contracts/booking-engine/requirements-validation"
import { Separator } from "@voyant-travel/ui/components"
import { Button } from "@voyant-travel/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@voyant-travel/ui/components/card"
import { Label } from "@voyant-travel/ui/components/label"
import { Textarea } from "@voyant-travel/ui/components/textarea"
import { Loader2 } from "lucide-react"
import { useBookingsUiMessagesOrDefault } from "../../../i18n/index.js"
import type { Draft } from "../../lib/draft-state.js"
import { describeUnsatisfiedRequirements } from "../../lib/unsatisfied-requirements.js"
import { JourneyErrors, JourneyWarnings } from "./shared.js"

// ─────────────────────────────────────────────────────────────────
// Review
// ─────────────────────────────────────────────────────────────────

export function ReviewStep({
  draft,
  setDraft,
  isCommitting,
  onConfirm,
  canConfirm,
  renderExtras,
  surface,
  warnings,
  unsatisfied,
  shape,
}: {
  draft: Draft
  setDraft: (next: Draft) => void
  isCommitting: boolean
  onConfirm: () => void
  warnings?: ReadonlyArray<string>
  /**
   * The server's `selection_incomplete.unsatisfied[]`, rendered here as the
   * complete list next to Confirm — the button that provoked the rejection.
   *
   * Deliberately the WHOLE list, including what a step already anchored: a
   * summary at the point of failure plus an inline message on the control is
   * the standard accessible pattern, and it is the only place a requirement no
   * step draws is guaranteed to appear.
   */
  unsatisfied?: ReadonlyArray<UnsatisfiedRequirementV1>
  /** Descriptor, used only to render band and field LABELS in that list. */
  shape?: BookingRequirementsV1
  /** Gate the confirm button — when `false`, it's disabled with a hint
   *  (stacked layout, where there are no per-step advance gates). The
   *  wizard reaches Review only after passing every gate, so it omits
   *  this (defaults to enabled). */
  canConfirm?: boolean
  renderExtras?: () => React.ReactNode
  /**
   * Drives the notes field. Public storefronts collect
   * customer-facing "anything we should know?" notes; operator
   * surfaces collect operator-only internal notes. Defaults to
   * `admin` so existing operator usage stays unchanged.
   */
  surface?: "admin" | "public"
  /** Live quote total + currency — drives the price-override default. */
  pricing?: { total: number; currency: string } | null
}): React.ReactElement {
  const messages = useBookingsUiMessagesOrDefault()
  const isPublic = surface === "public"
  const leadName =
    (draft.billing.buyerType === "B2B" ? draft.billing.company?.name : undefined) ||
    [draft.billing.contact.firstName, draft.billing.contact.lastName].filter(Boolean).join(" ") ||
    messages.bookingJourney.values.noValue
  const leadEmail = draft.billing.contact.email || messages.bookingJourney.values.noValue
  const unsatisfiedMessages = describeUnsatisfiedRequirements(unsatisfied, messages, shape).map(
    (entry) => entry.message,
  )
  return (
    <Card>
      <CardHeader>
        <CardTitle>{messages.bookingJourney.review.title}</CardTitle>
      </CardHeader>
      <Separator />
      <CardContent className="space-y-4">
        <div>
          <div className="font-medium">{messages.bookingJourney.review.leadContact}</div>
          <div className="text-muted-foreground text-sm">
            {leadName} · {leadEmail}
          </div>
        </div>
        <div>
          <div className="font-medium">{messages.bookingJourney.review.travelers}</div>
          <ul className="text-muted-foreground text-sm">
            {draft.travelers.map((t, i) => (
              <li key={t.rowId ?? i}>
                {t.firstName} {t.lastName} ({t.band})
              </li>
            ))}
          </ul>
        </div>
        {/* Public storefront collects a customer-facing note. Operator
            finalize controls (internal notes, price override, Travel Credit, document
            generation) live on the Payment block, not here. */}
        {isPublic ? (
          <div className="space-y-1">
            <Label htmlFor="bj-customer-notes">
              {messages.bookingJourney.review.customerNotes}
            </Label>
            <Textarea
              id="bj-customer-notes"
              placeholder={messages.bookingJourney.review.customerNotesPlaceholder}
              value={draft.customerNotes ?? ""}
              onChange={(e) => setDraft({ ...draft, customerNotes: e.target.value })}
            />
          </div>
        ) : null}
        {renderExtras ? <div>{renderExtras()}</div> : null}
        {unsatisfiedMessages.length > 0 ? (
          <div className="space-y-1">
            <div className="font-medium text-destructive text-sm">
              {messages.bookingJourney.unsatisfied.title}
            </div>
            <JourneyErrors errors={unsatisfiedMessages} />
          </div>
        ) : null}
        <JourneyWarnings warnings={warnings} />
        <div className="space-y-2">
          <Button onClick={onConfirm} disabled={isCommitting || canConfirm === false}>
            {isCommitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {messages.bookingJourney.review.confirming}
              </>
            ) : (
              messages.bookingJourney.review.confirmBooking
            )}
          </Button>
          {canConfirm === false ? (
            <p className="text-muted-foreground text-sm">
              {messages.bookingJourney.review.completeToConfirm}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
