import type { BookingSelectionV1 } from "@voyant-travel/catalog/booking-engine"
import type { OfferPreviewResultV1 } from "@voyant-travel/catalog-contracts/booking-engine/preview-contracts"

import type { CatalogComponentBookingDraftOverrides } from "./catalog-component-adapter.js"
import type { TripComponent, TripEnvelope, TripReservationPlan } from "./schema.js"
import type { PriceTripInput, StartTripCheckoutInput, TripComponentStatus } from "./validation.js"

export interface Trip {
  envelope: TripEnvelope
  components: TripComponent[]
}

export interface TripListResult {
  data: Trip[]
  total: number
  limit: number
  offset: number
}

export interface PriceTripResult {
  envelope: TripEnvelope
  components: TripComponent[]
  pricing: {
    currency: string
    subtotalAmountCents: number
    taxAmountCents: number
    totalAmountCents: number
    componentCount: number
    pricedComponentCount: number
    warnings?: string[]
  }
  warnings: string[]
  failures: Array<{ componentId: string; reason: string }>
}

export interface CatalogComponentQuoteInput {
  component: TripComponent
  bookingDraft: BookingSelectionV1
  scope: PriceTripInput["scope"]
}

export interface PriceTripDeps {
  /**
   * Non-binding v1 Offer Preview for one catalog-backed component. It carries
   * no id and no expiry by construction — a composer price is a read, and the
   * binding price is minted later by the accepted-Proposal Booking Session.
   */
  quoteCatalogComponent: (input: CatalogComponentQuoteInput) => Promise<OfferPreviewResultV1>
  componentBookingDraftOverrides?: Record<string, CatalogComponentBookingDraftOverrides>
}

export interface ReserveComponentInput {
  envelope: TripEnvelope
  component: TripComponent
  reservationPlanId?: string | null
}

export interface ReserveComponentResult {
  status: "held" | "booked"
  bookingId?: string
  bookingGroupId?: string
  orderId?: string
  paymentSessionId?: string
  providerRef?: string
  supplierRef?: string
  holdToken?: string
  holdExpiresAt?: string
  warnings?: string[]
}

export type ReserveComponentPreflightStatus = "ok" | "price_changed" | "unavailable" | "expired"

export interface ReserveComponentPreflightResult {
  status: ReserveComponentPreflightStatus
  reason?: string
  warnings?: string[]
  details?: Record<string, unknown>
}

export interface ReleaseReservedComponentInput {
  component: TripComponent
  reserveResult: ReserveComponentResult
}

export interface ReleaseReservedComponentResult {
  released: boolean
  reason?: string
}

export type TripReservationPlanComponentKind = "catalog_backed" | "non_catalog"

export interface SubmitTripReservationPlanComponent {
  componentId: string
  reservationKind: TripReservationPlanComponentKind
  component: TripComponent
}

export interface SubmitTripReservationPlanInput {
  reservationPlan: TripReservationPlan
  envelope: TripEnvelope
  components: SubmitTripReservationPlanComponent[]
  idempotencyKey?: string | null
}

export interface SubmitTripReservationPlanResult {
  reservationPlanId: string
  status: "reserved" | "failed"
  reserved: Array<{
    componentId: string
    status: "held" | "booked"
    result: ReserveComponentResult
  }>
  failures: Array<{
    componentId: string
    reason: string
    code?: string
    details?: Record<string, unknown>
  }>
  compensations: Array<{
    componentId: string
    status: "released" | "release_failed" | "release_not_configured"
    reason?: string
  }>
  warnings: string[]
}

export interface ReserveTripDeps {
  quoteCatalogComponentBeforeReserve?: (
    input: CatalogComponentQuoteInput,
  ) => Promise<OfferPreviewResultV1>
  validateNonCatalogComponentBeforeReserve?: (
    input: ReserveComponentInput,
  ) => Promise<ReserveComponentPreflightResult | null | undefined>
  submitReservationPlan: (
    input: SubmitTripReservationPlanInput,
  ) => Promise<SubmitTripReservationPlanResult>
}

export interface ReserveTripResult {
  envelope: TripEnvelope
  components: TripComponent[]
  reservationPlanId?: string | null
  reserved: Array<{ componentId: string; status: "held" | "booked" }>
  failures: Array<{
    componentId: string
    reason: string
    code?: string
    details?: Record<string, unknown>
  }>
  compensations: Array<{
    componentId: string
    status: "released" | "release_failed" | "release_not_configured"
    reason?: string
  }>
  warnings: string[]
}

export type CheckoutHandoffKind =
  | "card_redirect"
  | "payment_session"
  | "bank_transfer_instructions"
  | "hold_placed"
  | "inquiry_received"

export interface ComponentCheckoutInput {
  envelope: TripEnvelope
  component: TripComponent
  intent: StartTripCheckoutInput["intent"]
  request: StartTripCheckoutInput["request"]
}

export interface ComponentCheckoutResult {
  kind: CheckoutHandoffKind
  status?: "checkout_started" | "booked"
  bookingId?: string
  bookingGroupId?: string
  orderId?: string
  paymentSessionId?: string
  providerRef?: string
  supplierRef?: string
  checkoutUrl?: string | null
  externalReference?: string | null
  bankTransferInstructions?: Record<string, unknown> | null
  expiresAt?: string | null
  warnings?: string[]
}

export interface TripCheckoutInput {
  trip: Trip
  intent: StartTripCheckoutInput["intent"]
  request: StartTripCheckoutInput["request"]
}

export interface TripCheckoutResult {
  kind: CheckoutHandoffKind
  status?: "checkout_started" | "booked"
  paymentSessionId?: string
  checkoutUrl?: string | null
  bankTransferInstructions?: Record<string, unknown> | null
  expiresAt?: string | null
  warnings?: string[]
}

export interface StartCheckoutDeps {
  startTripCheckout?: (input: TripCheckoutInput) => Promise<TripCheckoutResult>
  startComponentCheckout: (input: ComponentCheckoutInput) => Promise<ComponentCheckoutResult>
}

export interface StartedTripComponentCheckout {
  componentId: string
  kind: CheckoutHandoffKind
  bookingId: string | null
  orderId: string | null
  paymentSessionId: string | null
  checkoutUrl: string | null
  bankTransferInstructions: Record<string, unknown> | null
  expiresAt: string | null
}

export interface StartCheckoutTarget {
  envelopeId: string
  status: "checkout_started"
  currency: string
  totalAmountCents: number
  paymentSessionId: string | null
  checkoutUrl: string | null
  holdExpiresAt: string | null
}

export interface StartCheckoutResult {
  envelope: TripEnvelope
  components: TripComponent[]
  target: StartCheckoutTarget
  componentCheckouts: StartedTripComponentCheckout[]
  failures: Array<{ componentId: string; reason: string }>
  warnings: string[]
}

export interface CompleteTripCheckoutInput {
  envelopeId?: string
  paymentSessionId?: string
  paidAt?: string
  actorId?: string | null
  payload?: Record<string, unknown>
}

export interface CompleteTripCheckoutResult {
  envelope: TripEnvelope
  components: TripComponent[]
  updatedComponentIds: string[]
  alreadyCompleted: boolean
}

export type ComponentCancellationAction = "cancel" | "no_op" | "staff_remediation"

export interface ComponentCancellationPreviewInput {
  envelope: TripEnvelope
  component: TripComponent
  reason?: string
  requestedAt: Date
  request: Record<string, unknown>
}

export interface ComponentCancellationPreview {
  componentId: string
  action: ComponentCancellationAction
  currentStatus: TripComponentStatus
  staffActionRequired: boolean
  reason?: string
  refundAmountCents?: number
  refundCurrency?: string
  penaltyAmountCents?: number
  supplierCancellationDeadline?: string | null
  policySummary?: string | null
  snapshot?: Record<string, unknown>
}

export interface PreviewTripCancellationDeps {
  previewComponentCancellation?: (
    input: ComponentCancellationPreviewInput,
  ) => Promise<ComponentCancellationPreview>
}

export interface TripCancellationPreviewResult {
  envelope: TripEnvelope
  components: TripComponent[]
  preview: {
    envelopeId: string
    selectedComponentIds: string[]
    currency: string | null
    estimatedRefundAmountCents: number
    estimatedPenaltyAmountCents: number
    staffActionRequired: boolean
    components: ComponentCancellationPreview[]
    warnings: string[]
  }
}

export interface CancelComponentInput extends ComponentCancellationPreviewInput {
  preview: ComponentCancellationPreview
}

export interface CancelComponentResult {
  status: "cancelled" | "refused" | "failed"
  refundAmountCents?: number
  refundCurrency?: string
  reason?: string
  snapshot?: Record<string, unknown>
}

export interface CancelTripComponentsDeps extends PreviewTripCancellationDeps {
  cancelComponent?: (input: CancelComponentInput) => Promise<CancelComponentResult>
}

export interface CancelTripComponentsResult extends TripCancellationPreviewResult {
  cancelled: Array<{ componentId: string; status: "cancelled" }>
  remediation: Array<{ componentId: string; reason: string }>
  skipped: Array<{ componentId: string; reason: string }>
}

export class TripsInvariantError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TripsInvariantError"
  }
}
