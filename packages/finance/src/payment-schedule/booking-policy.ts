/**
 * The one walk from a booking to the payment policy that governs it.
 *
 * Every surface that decides what a customer owes and when has to end up
 * here. Before voyant#4744 two of them did not: `default-plan` and the
 * checkout collection runtime carried their own `depositMode` /
 * `depositValue` / `balanceDueDaysBeforeStart` trio with a hardcoded 30%
 * fallback, so the same booking answered "what is the deposit?" differently
 * depending on which route an operator or agent happened to call — and the
 * operator editing the settings page saw neither number move.
 *
 * The cascade readers are INJECTED for the same reason they are on
 * {@link import("./routes.js").BookingScheduleRoutesOptions}: resolving a
 * supplier / category / listing layer means reading across vertical modules
 * that `@voyant-travel/finance` must not statically import.
 *
 * The booking row is passed IN rather than loaded here. Every caller already
 * holds it, and reading `bookings` from one more file would widen finance's
 * reach into another module's table for nothing.
 */

import { getBookingOriginByBookingId } from "@voyant-travel/bookings"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import {
  noDepositPolicy,
  type PaymentPolicy,
  type ResolvedPaymentPolicy,
  resolveEffectivePaymentPolicy,
} from "../payment-policy.js"

/**
 * The booking-keyed half of the policy cascade.
 *
 * Split out of `BookingScheduleRoutesOptions` (which extends it) so a caller
 * that only needs "what does this booking owe" — the `default-plan` route, the
 * checkout collection runtime — depends on these readers rather than on the
 * whole route module's option bag.
 */
export interface BookingPaymentPolicyCascadeReaders {
  /** Operator-default payment policy (the cascade's last-resort layer). */
  resolveOperatorDefaultPaymentPolicy(db: PostgresJsDatabase): Promise<PaymentPolicy | null>
  /** Supplier-layer override keyed off the booking's supplier link. */
  resolveSupplierPolicy(db: PostgresJsDatabase, bookingId: string): Promise<PaymentPolicy | null>
  /** Product-category override (first category by sortOrder). */
  resolveCategoryPolicy(db: PostgresJsDatabase, bookingId: string): Promise<PaymentPolicy | null>
  /** Per-listing override (first booking-item product policy). */
  resolveListingPolicy(db: PostgresJsDatabase, bookingId: string): Promise<PaymentPolicy | null>
  /**
   * Terms stated on one accepted Proposal Version.
   *
   * Keyed by the Proposal Version rather than the booking on purpose: finance
   * already owns the walk from a booking to its origin (`booking_origins` is
   * bookings', which finance depends on acyclically), so the injected reader
   * only ever touches `proposal_versions` — the one table its own module owns.
   *
   * Optional. A deployment that composes no proposals module leaves it unset
   * and the cascade is exactly what it was before the layer existed.
   */
  resolveProposalVersionPolicy?(
    db: PostgresJsDatabase,
    proposalVersionId: string,
  ): Promise<PaymentPolicy | null>
}

/** The booking columns the cascade reads. */
export interface BookingPaymentPolicySubject {
  id: string
  customerPaymentPolicy: unknown
}

/**
 * Walk the cascade for one booking: booking override → accepted proposal →
 * listing → category → supplier → operator default.
 */
export async function resolveBookingPaymentPolicy(
  db: PostgresJsDatabase,
  booking: BookingPaymentPolicySubject,
  readers: BookingPaymentPolicyCascadeReaders,
): Promise<ResolvedPaymentPolicy> {
  const operatorDefault = (await readers.resolveOperatorDefaultPaymentPolicy(db)) ?? noDepositPolicy

  // Supplier-layer override. Falls back to operator default when the booking
  // has no supplier link or the supplier hasn't configured a custom policy.
  const supplierPolicy = await readers.resolveSupplierPolicy(db, booking.id)

  // Product-category override. Walks the booking's products → categories and
  // picks the first category (by productCategoryProducts.sortOrder ascending)
  // that defines a policy. Wins over supplier per the cascade order.
  const categoryPolicy = await readers.resolveCategoryPolicy(db, booking.id)

  // Per-listing override. The first booking-item's product with a non-null
  // customerPaymentPolicy wins. Most specific catalog layer — beats category,
  // supplier, and operator default.
  const listingPolicy = await readers.resolveListingPolicy(db, booking.id)

  // The terms on the accepted Proposal Version this booking came from, when it
  // came from one. This is what the customer agreed to, so it outranks every
  // catalog default underneath it.
  const proposalPolicy = await resolveAcceptedProposalPolicy(db, booking.id, readers)

  // Booking-level override. The booking's own customerPaymentPolicy column
  // wins over every catalog layer. Reserved for ops adjustments — most
  // bookings leave this null.
  const bookingPolicy = (booking.customerPaymentPolicy as PaymentPolicy | null | undefined) ?? null

  return resolveEffectivePaymentPolicy({
    bookingPolicy,
    proposalPolicy,
    listingPolicy,
    categoryPolicy,
    supplierPolicy,
    operatorDefault,
  })
}

/**
 * The payment terms the customer agreed to, when this booking came from an
 * accepted Proposal Version and that version stated any.
 *
 * `booking_origins` is the durable link, so this re-derives on every
 * resolution rather than depending on anything having been copied onto the
 * booking at commit time.
 */
async function resolveAcceptedProposalPolicy(
  db: PostgresJsDatabase,
  bookingId: string,
  readers: BookingPaymentPolicyCascadeReaders,
): Promise<PaymentPolicy | null> {
  if (!readers.resolveProposalVersionPolicy) return null
  const origin = await getBookingOriginByBookingId(db, bookingId)
  if (origin?.originSource !== "accepted_proposal_version") return null
  if (!origin.proposalVersionId) return null
  return readers.resolveProposalVersionPolicy(db, origin.proposalVersionId)
}
