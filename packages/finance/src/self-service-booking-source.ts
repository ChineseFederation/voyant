/**
 * Internal contract for resolving a Booking Session + Quote into a
 * server-derived booking-create command.
 *
 * Finance owns the durable create command while Catalog owns the Session
 * lifecycle. Catalog supplies this contract directly to the settlement helper
 * inside the root transaction; it is deliberately not a deployment runtime
 * port or an alternative public booking path.
 *
 * The split into `resolve` and `consume` is load-bearing. Resolution happens
 * before the durable claim and may reject; consumption happens *inside* the
 * command transaction, so an exact idempotent replay short-circuits at the
 * claim and never re-enters it. Consuming before the claim would make every
 * legitimate retry fail as already-consumed.
 */
import type { AnyDrizzleDb } from "@voyant-travel/db"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import type { BookingCreateInput } from "./service-booking-create.js"

/** Who is creating the booking, as already proven by the route. */
export interface SelfServiceBookingCaller {
  /** Person id of an authenticated customer. Absent for a verified guest. */
  personId?: string
  /**
   * Contact a verification challenge proved control of. The provider matches
   * it against the draft's billing contact and rejects a mismatch, so a
   * challenge for one address cannot authorize a booking billed to another.
   */
  verifiedEmail?: string
  verifiedPhone?: string
}

export type SelfServiceBookingSourceRejection =
  | "session_not_found"
  | "session_consumed"
  | "quote_not_found"
  | "quote_consumed"
  | "quote_expired"
  | "hold_expired"
  | "entity_mismatch"
  | "price_changed"
  | "not_public"
  | "contact_mismatch"
  | "incomplete_selection"
  | "unsupported_vertical"
  | "session_forbidden"
  | "hold_required"

export interface SelfServiceBookingSourceResolved {
  status: "ok"
  /**
   * The create command, derived entirely server-side. A public caller never
   * supplies booking numbers, relationship ids, prices, tax lines, status, or
   * any other internal Finance field; the route fills in only the booking
   * number it allocated.
   */
  command: Omit<BookingCreateInput, "bookingNumber">
  /** When the hold lapses. The command must commit before this. */
  holdExpiresAt: Date | null
}

export type SelfServiceBookingSourceResolution =
  | SelfServiceBookingSourceResolved
  | { status: "rejected"; reason: SelfServiceBookingSourceRejection }

export interface SelfServiceBookingSourceRuntime {
  /**
   * Load the Session and Quote and verify ownership, public scope, expiry,
   * entity, price, and hold. Returns a typed rejection rather than throwing so
   * the route can map each reason to a status code without string matching.
   */
  resolveBookingSource(input: {
    db: PostgresJsDatabase
    sessionId: string
    quoteId: string
    caller: SelfServiceBookingCaller
    /** Proves the caller holds the anonymous Session they are booking. */
    sessionCapability?: string
  }): Promise<SelfServiceBookingSourceResolution>
  /**
   * Convert the hold, consume the draft and quote, and associate the catalog
   * snapshot with the new booking — all inside the caller's transaction.
   *
   * Must be called only from within the booking-create command transaction.
   * Throwing rolls the whole create back.
   */
  consumeBookingSource(
    tx: AnyDrizzleDb,
    input: { sessionId: string; quoteId: string; bookingId: string },
  ): Promise<void>
}
