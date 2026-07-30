/**
 * Contract for resolving a public booking draft + quote into a server-derived
 * booking-create command.
 *
 * Finance owns the durable create command but not the catalog state a public
 * caller quotes against, so the resolution and consumption of that state is a
 * runtime port. A deployment that has not selected a provider simply does not
 * advertise self-service creation — the action stays unavailable rather than
 * falling back to anything.
 *
 * The split into `resolve` and `consume` is load-bearing. Resolution happens
 * before the durable claim and may reject; consumption happens *inside* the
 * command transaction, so an exact idempotent replay short-circuits at the
 * claim and never re-enters it. Consuming before the claim would make every
 * legitimate retry fail as already-consumed.
 */
import { definePort } from "@voyant-travel/core/project"
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
  | "draft_not_found"
  | "draft_consumed"
  | "quote_not_found"
  | "quote_consumed"
  | "quote_expired"
  | "hold_expired"
  | "entity_mismatch"
  | "price_changed"
  | "not_public"
  | "contact_mismatch"
  | "incomplete_draft"
  | "unsupported_vertical"
  | "draft_forbidden"
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
   * Load the draft and quote and verify ownership, public scope, expiry,
   * entity, price, and hold. Returns a typed rejection rather than throwing so
   * the route can map each reason to a status code without string matching.
   */
  resolveBookingSource(input: {
    db: PostgresJsDatabase
    draftId: string
    quoteId: string
    caller: SelfServiceBookingCaller
    /** Proves the caller holds the draft they are booking. */
    draftCapabilityToken?: string
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
    input: { draftId: string; quoteId: string; bookingId: string },
  ): Promise<void>
}

/**
 * Gate for self-service booking creation.
 *
 * Carries an importable conformance reference because the create action is
 * conditionally available on it: the deployment graph refuses to enable the
 * action unless this exact port is consumed one-valued by its owning unit.
 */
export const financeSelfServiceBookingSourceRuntimePort =
  definePort<SelfServiceBookingSourceRuntime>({
    id: "finance.self-service-booking-source.runtime",
    conformance: {
      entry: "@voyant-travel/finance/self-service-booking-source",
      export: "financeSelfServiceBookingSourceRuntimePort",
    },
    test(provider) {
      if (provider === null || typeof provider !== "object") {
        throw new Error("finance.self-service-booking-source.runtime provider must be an object.")
      }
      for (const method of ["resolveBookingSource", "consumeBookingSource"] as const) {
        if (typeof Reflect.get(provider, method) !== "function") {
          throw new Error(
            `finance.self-service-booking-source.runtime provider must implement ${method}().`,
          )
        }
      }
    },
  })
