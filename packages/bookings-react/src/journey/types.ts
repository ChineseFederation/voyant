/**
 * React-side draft and step types that complement the booking-engine wire
 * contracts.
 */

import type {
  BookingDraftV1,
  PricingBreakdownV1,
} from "@voyant-travel/catalog-contracts/booking-engine/contracts"
import type { BookingRequirements } from "@voyant-travel/catalog-contracts/booking-engine/requirements"

export type JourneyStep =
  | "departure"
  | "billing"
  | "travelers"
  | "options"
  | "accommodation"
  | "addons"
  | "payment"
  | "documents"
  | "review"

export const JOURNEY_STEP_ORDER: ReadonlyArray<JourneyStep> = [
  "departure",
  "billing",
  "travelers",
  "options",
  "accommodation",
  "addons",
  "payment",
  "documents",
  "review",
]

export interface JourneySurface {
  /** Operator-side or storefront — drives default slot behavior. */
  kind: "admin" | "public"
}

export interface LeadContactPickerProps {
  /** Current buyer type — the picker should search PEOPLE for B2C and
   *  ORGANIZATIONS for B2B. */
  buyerType: "B2C" | "B2B"
  /** Apply a picked lead to the draft's billing fields. A PARTIAL — only
   *  the provided fields are merged, so separate CRM lookups (person/org
   *  record, then its address) can each fill their slice without clobbering
   *  the others. B2C fills the person; B2B fills companyName/taxId; both
   *  fill the billing address from the CRM record. */
  apply: (contact: {
    firstName?: string
    lastName?: string
    email?: string
    phone?: string
    personId?: string
    organizationId?: string
    companyName?: string
    taxId?: string
    address?: {
      line1?: string
      line2?: string
      city?: string
      postal?: string
      country?: string
    }
  }) => void
}

export interface TravelerContactPickerProps {
  rowIndex: number
  /** The CRM person currently linked to this traveler row, if any. The
   *  picker should reflect it in its combobox — so e.g. "Copy from billing"
   *  (which links the billing person) shows that person as selected. */
  selectedPersonId?: string
  /** Apply a picked contact to the traveler at `rowIndex`. */
  apply: (contact: {
    firstName: string
    lastName: string
    email?: string
    phone?: string
    personId?: string
  }) => void
}

/**
 * Context handed to `renderBillingExtras` — the picked lead + the departure —
 * so a template can run lead-aware checks (e.g. "this customer already booked
 * this departure") next to the billing block.
 */
export interface BillingExtrasContext {
  buyerType: "B2C" | "B2B"
  personId?: string
  organizationId?: string
  productId: string
  departureSlotId?: string
  departureDate?: string
}

/**
 * Props for the injectable Travel Credit picker. The operator surface wires an async
 * combobox (search the admin Travel Credit list) so staff pick stored value without
 * knowing the exact code; the storefront keeps the customer code-entry form.
 */
export interface TravelCreditPickerProps {
  /** Currently linked Travel Credit redemption on the draft, if any. */
  value: { travelCreditId?: string; amountCents?: number }
  /** Apply a picked Travel Credit's full remaining balance, or clear with `null`. */
  onApply: (picked: { travelCreditId: string; amountCents: number } | null) => void
  /** Booking currency + payable total, to display/cap the redemption. */
  currency?: string
  amountCents?: number
}

/**
 * Props for the injectable departure picker rendered in the Configure
 * step for a `"departure"` sub-step. The template wires this with a
 * scheduled-departures source (e.g. operator availability) so the
 * operator picks a real departure rather than typing a free date.
 *
 * The picker owns its own data-loading and should fall back to a free
 * date when the product has no scheduled departures — the journey just
 * stores whatever it reports via `onChange`.
 */
export interface DeparturePickerProps {
  /** The owned product whose departures to load. */
  productId: string
  /** Selected product option, used to filter departures (null = any). */
  optionId: string | null
  /** Currently-picked scheduled departure id, or null. */
  slotId: string | null
  /** Currently-entered departure date (free-date fallback), or null. */
  departureDate: string | null
  /** Currently-entered departure time (free-date fallback), or null. */
  departureTime: string | null
  /** Report a change — any omitted field is left unchanged on the draft. */
  onChange: (next: {
    slotId?: string | null
    departureDate?: string | null
    departureTime?: string | null
  }) => void
}

/** A picked inventory unit (room) selection on the draft's configure. */
export interface JourneyOptionSelection {
  optionId: string
  optionName?: string
  optionUnitId?: string
  optionUnitName?: string
  quantity: number
}

/**
 * Props for the injectable units (rooms) picker rendered in the Configure
 * step for an `"option-units"` sub-step. The template wires it to an
 * inventory source (operator availability) so the operator picks room
 * quantities for the chosen option + departure; the journey stores the
 * result on `configure.optionSelections`.
 */
export interface UnitsPickerProps {
  /** The owned product whose units to load. */
  productId: string
  /** Currently-selected product option (drives which units show), or null. */
  optionId: string | null
  /** Currently-picked departure slot (drives per-slot availability), or null. */
  slotId: string | null
  /** Current unit selections on the draft. */
  selections: ReadonlyArray<JourneyOptionSelection>
  /** Report the new full set of unit selections. */
  onChange: (selections: JourneyOptionSelection[]) => void
}

/**
 * Capabilities supplied by the template — checkout-ui's PaymentStep
 * consumes these to render the right provider widget. Each flag is
 * an independent on/off switch the operator configures per
 * deployment / supplier:
 *
 * - `acceptsCard` — Stripe / Netopia / generic card flow. The
 *   `renderPaymentProviderStep` slot supplies the actual widget.
 * - `acceptsBankTransfer` — operator emails the buyer bank details;
 *   payment remains outstanding in Finance after Commit.
 * - `acceptsHold` — staff/agent-only soft-hold path; useful when an
 *   operator is brokering for an end customer.
 * - `acceptsTicketOnCredit` — agency credit account.
 * - `acceptsInquiry` — lead-only flow: NO inventory hold, NO charge.
 *   The "booking" is recorded as an inquiry for the operator to
 *   manually follow up on. Right for tour operators where a quote
 *   conversation precedes booking.
 */
export interface PaymentProviderCapabilities {
  acceptsCard: boolean
  acceptsHold: boolean
  acceptsBankTransfer?: boolean
  acceptsTicketOnCredit: boolean
  acceptsInquiry?: boolean
  /** Free-form provider-specific config (e.g. Netopia merchant id,
   *  Stripe publishable key, bank-transfer instructions). */
  config?: Record<string, unknown>
}

export interface PaymentProviderStepRenderProps {
  intent: BookingDraftV1["payment"]["intent"]
  schedule: BookingDraftV1["payment"]["schedule"]
  capabilities: PaymentProviderCapabilities
}

/**
 * Caller-provided context for the side-panel summary. Keep it
 * vertical-agnostic — the panel renders whatever subset is present.
 */
export interface BookingEntitySummary {
  /** Headline name — e.g. product / cruise / hotel name. */
  name: string
  /** Optional second line — e.g. "Iceland · 1 day", "7 nights · Mediterranean". */
  subtitle?: string
  /** Optional hero image — small thumbnail at the top of the panel. */
  heroImageUrl?: string
  /** Vertical badge — drives the "What you're booking" header copy. */
  vertical?: "products" | "cruises" | "accommodations" | string
  /** Optional ISO date or formatted date — e.g. "Tue, May 5, 2026". */
  whenLabel?: string
  /** Optional location label — e.g. "Reykjavík", "Mediterranean", "Bucharest". */
  locationLabel?: string
  /** ISO start date (YYYY-MM-DD or full ISO) — used by the contract
   *  preview when the draft only carries a slot id. */
  startDate?: string
  /** ISO end date — paired with `startDate` for ranges and contract
   *  variables like `departure.end_date`. */
  endDate?: string
  /** Free-form destination / route string — surfaced as
   *  `product.destination` in contract variables. */
  destination?: string
}

export interface JourneyHeaderState {
  current: JourneyStep
  visited: ReadonlyArray<JourneyStep>
  steps: ReadonlyArray<JourneyStep>
  shape: BookingRequirements
}

export interface SidePanelState {
  pricing: PricingBreakdownV1 | null
  isQuoting: boolean
  invalidReason?: string
  entitySummary?: BookingEntitySummary
  currentStep?: JourneyStep
  steps?: ReadonlyArray<JourneyStep>
  shape?: BookingRequirements
  draft?: BookingDraftV1
}
