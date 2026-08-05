// agent-quality: file-size exception -- owner: bookings-react; existing UI surface stays co-located until a dedicated split preserves behavior and tests.
"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@voyant-travel/ui/components/accordion"
import { Card, CardContent } from "@voyant-travel/ui/components/card"
import { Skeleton } from "@voyant-travel/ui/components/skeleton"
import {
  formatMessage,
  useBookingsUiI18nOrDefault,
  useBookingsUiMessagesOrDefault,
} from "../../i18n/index.js"
import type { BookingEntitySummary, JourneyStep, SidePanelState } from "../types.js"

/**
 * Right-rail summary panel. Shows what's being booked, an
 * accordion-per-step recap of the user's input, and the live
 * pricing breakdown at the bottom. The current step's accordion is
 * expanded by default; users can click any step to peek at what
 * they've filled in elsewhere.
 */
export function PriceSidePanel({
  pricing,
  isQuoting,
  invalidReason,
  entitySummary,
  currentStep,
  steps,
  shape,
  draft,
  className,
  pricingExtras,
}: SidePanelState & {
  className?: string
  /** Operator-only price controls (override + Travel Credit) rendered with the
   *  pricing, where they're most in context. */
  pricingExtras?: React.ReactNode
}): React.ReactElement {
  const { locale, messages } = useBookingsUiI18nOrDefault()
  // Only surface pricing once the user has configured what actually drives
  // the price — otherwise the quote's baseline shows a misleading total
  // (e.g. a per-pax "from" price before any room is picked). Room products
  // (an `option-units` sub-step) require a room selection; everything else
  // requires at least one traveler.
  const configuredPax = draft?.configure?.pax
    ? Object.values(draft.configure.pax).reduce<number>((sum, n) => sum + (n ?? 0), 0)
    : 0
  const isRoomProduct = (shape?.configureSubSteps ?? []).some((s) => s.kind === "option-units")
  const roomsPicked = (draft?.configure?.optionSelections?.length ?? 0) > 0
  const showPricing = isRoomProduct ? roomsPicked : configuredPax > 0
  const pricingHint = isRoomProduct
    ? messages.bookingJourney.sidePanel.pricingHintRooms
    : messages.bookingJourney.sidePanel.pricingHint
  // Departure shows directly under the product title — it's the most-glanced
  // fact, so it doesn't belong buried in the recap accordion.
  const departureText = draft ? stepHeadline("departure", draft, messages, locale) : ""

  return (
    <Card className={className}>
      {/* Image is a DIRECT Card child so the card's `has-[>img:first-child]`
          rule drops the top padding and rounds the top corners flush. */}
      {entitySummary?.heroImageUrl ? (
        <img
          src={entitySummary.heroImageUrl}
          alt={entitySummary.name}
          className="aspect-video w-full object-cover"
        />
      ) : null}
      {entitySummary ? (
        <EntityHeader summary={entitySummary} departureText={departureText} />
      ) : null}
      <CardContent className="space-y-4">
        {steps && steps.length > 0 && currentStep && draft ? (
          <StepRecap steps={steps} currentStep={currentStep} draft={draft} />
        ) : null}

        {/* `invalidReason` is a raw engine code (e.g. `no_sell_amount_configured`)
            and is expected on the pristine draft before any price driver is
            picked — surface it only once the buyer has configured what drives
            the price, and as a human-readable message, never the raw code. */}
        {invalidReason && showPricing ? (
          <p className="text-destructive text-sm">
            {messages.bookingJourney.validation.pricingUnavailable}
          </p>
        ) : null}
        {!showPricing ? (
          <p className="border-t pt-4 text-muted-foreground text-sm">{pricingHint}</p>
        ) : isQuoting && !pricing ? (
          <div className="space-y-2 border-t pt-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-20" />
          </div>
        ) : null}
        {showPricing && pricing ? (
          <div className="space-y-2 border-t pt-4">
            <ul className="space-y-1 text-sm">
              {pricing.lines.map((line) => (
                <li
                  key={`${line.kind}-${line.label}-${line.totalAmount}`}
                  className="flex justify-between"
                >
                  <span>
                    {line.label}
                    {line.quantity ? (
                      <span className="text-muted-foreground"> × {line.quantity}</span>
                    ) : null}
                  </span>
                  <span>{formatMoney(line.totalAmount, pricing.currency, locale)}</span>
                </li>
              ))}
            </ul>
            {pricing.taxes.length > 0 ? (
              <ul className="space-y-1 border-t pt-2 text-sm text-muted-foreground">
                {pricing.taxes.map((tax) => (
                  <li key={tax.code} className="flex justify-between">
                    <span>
                      {tax.label}
                      {tax.rate > 0 ? ` (${formatTaxRate(tax.rate)})` : ""}
                    </span>
                    <span>{formatMoney(tax.amount, pricing.currency, locale)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex justify-between border-t pt-2 font-medium">
              <span>{messages.bookingJourney.sidePanel.total}</span>
              <span>{formatMoney(pricing.total, pricing.currency, locale)}</span>
            </div>
          </div>
        ) : null}

        {pricingExtras ? <div className="border-t pt-4">{pricingExtras}</div> : null}
      </CardContent>
    </Card>
  )
}

function EntityHeader({
  summary,
  departureText,
}: {
  summary: BookingEntitySummary
  departureText?: string
}): React.ReactElement {
  // Text block only — the hero image is rendered as a direct Card child above.
  return (
    <div className="space-y-1 px-6 pt-4 pb-2">
      <div className="font-semibold leading-tight">{summary.name}</div>
      {departureText ? <div className="text-muted-foreground text-sm">{departureText}</div> : null}
      {summary.subtitle ? (
        <div className="text-muted-foreground text-sm">{summary.subtitle}</div>
      ) : null}
      {summary.whenLabel || summary.locationLabel ? (
        <div className="text-muted-foreground text-xs">
          {[summary.whenLabel, summary.locationLabel].filter(Boolean).join(" · ")}
        </div>
      ) : null}
    </div>
  )
}

function StepRecap({
  steps,
  currentStep,
  draft,
}: {
  steps: ReadonlyArray<JourneyStep>
  currentStep: JourneyStep
  draft: SidePanelState["draft"]
}): React.ReactElement | null {
  const messages = useBookingsUiMessagesOrDefault()
  if (!draft) return null
  // Departure shows in the header; payment + documents aren't worth a recap
  // row — so the accordion covers the substantive in-between steps only.
  const recapSteps = steps.filter(
    (step) => step !== "departure" && step !== "payment" && step !== "documents",
  )
  if (recapSteps.length === 0) return null
  // Default-open the current step. Uncontrolled — users can toggle
  // freely. Re-mounts when currentStep changes (key) so the
  // newly-active step opens automatically as the user advances.
  return (
    <Accordion key={currentStep} defaultValue={[currentStep]} multiple>
      {recapSteps.map((step) => (
        <AccordionItem key={step} value={step}>
          <AccordionTrigger className="py-3">
            <div className="flex flex-1 flex-col text-left">
              <span
                className={
                  step === currentStep ? "font-semibold" : "text-muted-foreground font-medium"
                }
              >
                {stepLabel(step, messages)}
              </span>
              <StepSummaryLine step={step} draft={draft} />
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <StepDetails step={step} draft={draft} />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}

function StepSummaryLine({
  step,
  draft,
}: {
  step: JourneyStep
  draft: NonNullable<SidePanelState["draft"]>
}): React.ReactElement | null {
  const { locale, messages } = useBookingsUiI18nOrDefault()
  const text = stepHeadline(step, draft, messages, locale)
  if (!text) return null
  return <span className="text-muted-foreground text-xs">{text}</span>
}

export function stepHeadline(
  step: JourneyStep,
  draft: NonNullable<SidePanelState["draft"]>,
  messages: ReturnType<typeof useBookingsUiMessagesOrDefault>,
  locale: string,
): string {
  switch (step) {
    case "departure": {
      const range = draft.configure?.dateRange
      if (range?.checkIn && range?.checkOut)
        return `${formatConfigureDate(range.checkIn, locale)} → ${formatConfigureDate(
          range.checkOut,
          locale,
        )}`
      // Never surface the raw slot id — show the departure date.
      return draft.configure?.departureDate
        ? formatConfigureDate(draft.configure.departureDate, locale)
        : ""
    }
    case "options": {
      const rooms = (draft.configure?.optionSelections ?? []).reduce(
        (sum, s) => sum + (s.quantity ?? 0),
        0,
      )
      if (rooms <= 0) return ""
      return `${rooms} ${
        rooms === 1
          ? messages.bookingJourney.sidePanel.roomSingular
          : messages.bookingJourney.sidePanel.roomPlural
      }`
    }
    case "billing": {
      const c = draft.billing.contact
      const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim()
      const companyName =
        draft.billing.buyerType === "B2B" ? draft.billing.company?.name?.trim() : undefined
      return companyName || name || c.email || messages.bookingJourney.values.notSet
    }
    case "travelers": {
      const filled = draft.travelers.filter((t) => t.firstName && t.lastName).length
      return formatMessage(messages.bookingJourney.sidePanel.filledOf, {
        filled,
        total: draft.travelers.length,
      })
    }
    case "accommodation": {
      const rooms = draft.accommodation?.rooms ?? []
      if (rooms.length === 0) return ""
      return `${rooms.length} ${
        rooms.length === 1
          ? messages.bookingJourney.sidePanel.roomSingular
          : messages.bookingJourney.sidePanel.roomPlural
      }`
    }
    case "addons": {
      const addons = draft.addons ?? []
      if (addons.length === 0) return messages.bookingJourney.values.none
      return `${addons.length} ${
        addons.length === 1
          ? messages.bookingJourney.sidePanel.addOnSingular
          : messages.bookingJourney.sidePanel.addOnPlural
      }`
    }
    case "payment": {
      const intent = draft.payment.intent
      if (intent === "card") return messages.bookingJourney.sidePanel.card
      if (intent === "hold") return messages.bookingJourney.sidePanel.hold
      if (intent === "ticket_on_credit") return messages.bookingJourney.sidePanel.onCredit
      return ""
    }
    case "review":
      return messages.bookingJourney.sidePanel.confirmAndBook
    default:
      return ""
  }
}

function StepDetails({
  step,
  draft,
}: {
  step: JourneyStep
  draft: NonNullable<SidePanelState["draft"]>
}): React.ReactElement | null {
  const messages = useBookingsUiMessagesOrDefault()
  switch (step) {
    case "departure":
      return <DepartureDetails draft={draft} />
    case "options":
      return <OptionsDetails draft={draft} />
    case "billing":
      return <BillingDetails draft={draft} />
    case "travelers":
      return <TravelersDetails draft={draft} />
    case "accommodation":
      return <AccommodationDetails draft={draft} />
    case "addons":
      return <AddonsDetails draft={draft} />
    case "payment":
      return <PaymentDetails draft={draft} />
    case "review":
      return (
        <p className="text-muted-foreground text-xs">
          {messages.bookingJourney.sidePanel.reviewDetails}
        </p>
      )
    default:
      return null
  }
}

function DepartureDetails({
  draft,
}: {
  draft: NonNullable<SidePanelState["draft"]>
}): React.ReactElement {
  const { locale, messages } = useBookingsUiI18nOrDefault()
  const cfg = draft.configure ?? {}
  const range = cfg.dateRange
  return (
    <dl className="space-y-1 text-xs">
      {/* Show the departure DATE, never the raw slot id. */}
      {cfg.departureDate ? (
        <Row
          label={messages.bookingJourney.sidePanel.departure}
          value={formatConfigureDate(cfg.departureDate, locale)}
        />
      ) : null}
      {range?.checkIn ? (
        <Row
          label={messages.bookingJourney.sidePanel.checkIn}
          value={formatConfigureDate(range.checkIn, locale)}
        />
      ) : null}
      {range?.checkOut ? (
        <Row
          label={messages.bookingJourney.sidePanel.checkOut}
          value={formatConfigureDate(range.checkOut, locale)}
        />
      ) : null}
    </dl>
  )
}

function OptionsDetails({
  draft,
}: {
  draft: NonNullable<SidePanelState["draft"]>
}): React.ReactElement {
  const messages = useBookingsUiMessagesOrDefault()
  const cfg = draft.configure ?? {}
  const selections = (cfg.optionSelections ?? []).filter((s) => (s.quantity ?? 0) > 0)
  return (
    <dl className="space-y-1 text-xs">
      {selections.map((selection) => (
        <Row
          key={selection.optionUnitId ?? selection.optionId}
          label={selection.optionUnitName ?? selection.optionName ?? selection.optionId}
          value={`× ${selection.quantity}`}
        />
      ))}
      {cfg.cabinCategoryId ? (
        <Row label={messages.bookingJourney.sidePanel.cabin} value={cfg.cabinCategoryId} />
      ) : null}
    </dl>
  )
}

function BillingDetails({
  draft,
}: {
  draft: NonNullable<SidePanelState["draft"]>
}): React.ReactElement {
  const messages = useBookingsUiMessagesOrDefault()
  const c = draft.billing.contact
  const a = draft.billing.address
  const addressLine = [a.line1, a.line2, a.city, a.region, a.postal, a.country]
    .filter(Boolean)
    .join(", ")
  const contactName =
    (draft.billing.buyerType === "B2B" ? draft.billing.company?.name : undefined) ||
    [c.firstName, c.lastName].filter(Boolean).join(" ")
  return (
    <dl className="space-y-1 text-xs">
      <Row
        label={messages.bookingJourney.sidePanel.name}
        value={contactName || messages.bookingJourney.values.noValue}
      />
      <Row
        label={messages.bookingJourney.sidePanel.email}
        value={c.email || messages.bookingJourney.values.noValue}
      />
      {c.phone ? <Row label={messages.bookingJourney.sidePanel.phone} value={c.phone} /> : null}
      <Row
        label={messages.bookingJourney.sidePanel.buyer}
        value={
          draft.billing.buyerType === "B2B"
            ? messages.bookingJourney.sidePanel.company
            : messages.bookingJourney.sidePanel.individual
        }
      />
      {draft.billing.buyerType === "B2B" && draft.billing.company?.name ? (
        <Row label={messages.bookingJourney.sidePanel.company} value={draft.billing.company.name} />
      ) : null}
      {draft.billing.buyerType === "B2B" && draft.billing.company?.vatId ? (
        <Row label={messages.bookingJourney.sidePanel.vat} value={draft.billing.company.vatId} />
      ) : null}
      {addressLine ? (
        <Row label={messages.bookingJourney.sidePanel.address} value={addressLine} />
      ) : null}
    </dl>
  )
}

function TravelersDetails({
  draft,
}: {
  draft: NonNullable<SidePanelState["draft"]>
}): React.ReactElement {
  const messages = useBookingsUiMessagesOrDefault()
  if (draft.travelers.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        {messages.bookingJourney.sidePanel.noTravelersYet}
      </p>
    )
  }
  return (
    <ul className="space-y-3 text-xs">
      {draft.travelers.map((t, i) => {
        const key = t.rowId ?? `t-${i}`
        const name = [t.firstName, t.lastName].filter(Boolean).join(" ").trim()
        const docType = t.documents?.documentType as string | undefined
        const docNum = t.documents?.documentNumber as string | undefined
        const docExpiry = t.documents?.documentExpiry as string | undefined
        const docLine = [docType, docNum, docExpiry ? `exp ${docExpiry}` : null]
          .filter(Boolean)
          .join(" · ")
        return (
          <li key={key} className="space-y-0.5">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">
                {formatMessage(messages.bookingJourney.sidePanel.travelerNumber, {
                  number: i + 1,
                })}
              </span>
              <span className="truncate font-medium">
                {name || messages.bookingJourney.values.noValue}
              </span>
            </div>
            {t.email ? <div className="text-muted-foreground truncate">{t.email}</div> : null}
            {t.phone ? <div className="text-muted-foreground">{t.phone}</div> : null}
            {t.dateOfBirth ? (
              <div className="text-muted-foreground">
                {messages.bookingJourney.sidePanel.dob} {t.dateOfBirth}
              </div>
            ) : null}
            {docLine ? <div className="text-muted-foreground">{docLine}</div> : null}
          </li>
        )
      })}
    </ul>
  )
}

function AccommodationDetails({
  draft,
}: {
  draft: NonNullable<SidePanelState["draft"]>
}): React.ReactElement {
  const messages = useBookingsUiMessagesOrDefault()
  const rooms = draft.accommodation?.rooms ?? []
  if (rooms.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        {messages.bookingJourney.sidePanel.notSelected}
      </p>
    )
  }
  return (
    <ul className="space-y-1 text-xs">
      {rooms.map((r) => (
        <li
          key={`${r.optionUnitId}-${r.ratePlanId ?? ""}-${r.quantity}`}
          className="flex justify-between gap-2"
        >
          <span className="truncate">{r.optionUnitId}</span>
          <span className="text-muted-foreground">
            × {r.quantity}
            {r.ratePlanId ? ` · ${r.ratePlanId}` : ""}
          </span>
        </li>
      ))}
    </ul>
  )
}

function AddonsDetails({
  draft,
}: {
  draft: NonNullable<SidePanelState["draft"]>
}): React.ReactElement {
  const messages = useBookingsUiMessagesOrDefault()
  const addons = draft.addons ?? []
  if (addons.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        {messages.bookingJourney.sidePanel.noAddonsSelected}
      </p>
    )
  }
  return (
    <ul className="space-y-1 text-xs">
      {addons.map((a) => (
        <li key={`${a.extraId}-${a.quantity}`} className="flex justify-between gap-2">
          <span className="truncate">{a.extraId}</span>
          <span className="text-muted-foreground">× {a.quantity}</span>
        </li>
      ))}
    </ul>
  )
}

function PaymentDetails({
  draft,
}: {
  draft: NonNullable<SidePanelState["draft"]>
}): React.ReactElement {
  const messages = useBookingsUiMessagesOrDefault()
  const intent = draft.payment.intent
  const label =
    intent === "card"
      ? messages.bookingJourney.sidePanel.payByCard
      : intent === "ticket_on_credit"
        ? messages.bookingJourney.sidePanel.ticketOnCredit
        : messages.bookingJourney.sidePanel.holdNoChargeYet
  return (
    <dl className="space-y-1 text-xs">
      <Row label={messages.bookingJourney.sidePanel.method} value={label} />
      {draft.payment.schedule ? (
        <Row
          label={messages.bookingJourney.sidePanel.schedule}
          value={String(draft.payment.schedule)}
        />
      ) : null}
    </dl>
  )
}

function Row({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate text-right">{value}</dd>
    </div>
  )
}

function stepLabel(
  step: JourneyStep,
  messages: ReturnType<typeof useBookingsUiMessagesOrDefault>,
): string {
  if (step === "billing") return messages.bookingJourney.steps.billingAndContact
  return messages.bookingJourney.steps[step]
}

function formatMoney(cents: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`
  }
}

/** Tax rate is stored as a fraction (0.19 → "19%"). Trim trailing zeros. */
function formatTaxRate(rate: number): string {
  return `${Number((rate * 100).toFixed(2))}%`
}

/** Format an ISO date (YYYY-MM-DD or full ISO) for the recap, falling back
 *  to the raw value when unparseable. Never surfaces a raw slot id. */
function formatConfigureDate(iso: string, locale: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  // Date-only strings parse as UTC midnight; render them in UTC so the
  // calendar date is not shifted for viewers in timezones west of UTC.
  const timeZone = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? "UTC" : undefined
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone,
  }).format(date)
}
