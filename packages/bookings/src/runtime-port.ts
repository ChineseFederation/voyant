import { definePort } from "@voyant-travel/core/project"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import type { BookingsApiModuleOptions } from "./index.js"
import type { BookingsExpireStaleHoldsJobRuntime } from "./job-runtime.js"
import type { BookingRequirementsApiModuleOptions } from "./requirements/index.js"
import type { ResolveBookingRequirementsProductSnapshot } from "./requirements/service-public.js"
import type {
  BookingOverviewItemEnricher,
  BookingPersonResolverContact,
  ResolveBookingTravelSnapshot,
} from "./route-runtime.js"

export interface BookingsRuntimeProvider {
  options: BookingsApiModuleOptions
}

export interface BookingsAccommodationRuntime {
  enrichOverviewItems: BookingOverviewItemEnricher
}

export interface BookingsFinanceRuntime {
  createStaleBookingHoldsJobRuntime(options: {
    resolveDb: () => PostgresJsDatabase | Promise<PostgresJsDatabase>
    userId?: string
  }): BookingsExpireStaleHoldsJobRuntime
}

export interface BookingsInventoryRuntime {
  resolveProductSnapshot: ResolveBookingRequirementsProductSnapshot
}

export interface BookingsRelationshipsRuntime {
  loadPersonTravelSnapshot: ResolveBookingTravelSnapshot
  upsertPersonFromContact(
    db: PostgresJsDatabase,
    contact: BookingPersonResolverContact,
    options: { source: string; sourceRef: string; requireContactPoint?: boolean },
  ): Promise<{ id: string } | null>
  getPersonById(db: PostgresJsDatabase, personId: string): Promise<unknown | null>
  getOrganizationById(db: PostgresJsDatabase, organizationId: string): Promise<unknown | null>
}

function objectPort<T extends object>(id: string, methods: readonly string[] = []) {
  return definePort<T>({
    id,
    test(provider) {
      if (provider === null || typeof provider !== "object") {
        throw new Error(`${id} provider must be an object.`)
      }
      for (const method of methods) {
        if (typeof Reflect.get(provider, method) !== "function") {
          throw new Error(`${id} provider must implement ${method}().`)
        }
      }
    },
  })
}

export const bookingsRuntimePort = definePort<BookingsRuntimeProvider>({
  id: "bookings.runtime",
  test(provider) {
    if (provider === null || typeof provider !== "object" || !provider.options) {
      throw new Error("bookings.runtime provider must supply module options.")
    }
  },
})
export const bookingRequirementsRuntimePort = objectPort<BookingRequirementsApiModuleOptions>(
  "bookings.requirements.runtime",
)
/**
 * Durable creation of one booking from a public draft and quote.
 *
 * Bookings owns the `/v1/public/bookings` resource, but Finance owns the
 * durable create command that composes a booking together with its payment
 * schedules, tax lines, and documents — and Finance depends on Bookings, not
 * the reverse. So the route lives here and the command arrives through this
 * port, the same way `bookings.finance.runtime` already inverts that edge.
 *
 * Consumed optionally: a deployment without a provider serves no public
 * creation route, which is the fail-closed posture the selected graph's
 * create action already declares.
 */
export interface BookingsSelfServiceCreateRuntime {
  createFromDraft(input: {
    db: PostgresJsDatabase
    draftId: string
    quoteId: string
    /** Proven identity: an account, or a contact a challenge verified. */
    caller: { personId?: string; verifiedEmail?: string; verifiedPhone?: string }
    /** Server-derived storefront/channel binding for immutable booking provenance. */
    storefront: { storefrontId: string; channelId: string }
    /** Stable request key; the durable command claims against it. */
    idempotencyKey: string
    /** Proves the caller holds the draft they are booking. */
    draftCapabilityToken?: string
    /**
     * The challenge that authorized a guest create. Absent for an
     * authenticated customer, who is identified by their account instead — the
     * provider derives the ledger principal from whichever is present, so this
     * must never be accepted from an already-authenticated caller.
     */
    guestChallengeId?: string
    /** The authenticated customer's user id, for ledger attribution. */
    userId?: string
    /**
     * Runs inside the create transaction, so anything spent here commits or
     * rolls back with the booking.
     */
    consumeSources?(tx: PostgresJsDatabase, bookingId: string): Promise<void>
  }): Promise<BookingsSelfServiceCreateResult>
}

export type BookingsSelfServiceCreateResult =
  | {
      status: "ok"
      bookingId: string
      bookingNumber: string
      /** The booking's real persisted status; null when it could not be read. */
      bookingStatus?: string | null
    }
  | { status: "rejected"; reason: string }

/**
 * Reads and spends the storefront verification challenge that authorizes a
 * guest booking create.
 *
 * Bookings owns the public create route but not the challenge; Storefront owns
 * the challenge but depends on Bookings, so it arrives through this port.
 * Consumed optionally: without it only authenticated customers can create.
 */
export interface BookingsGuestVerificationRuntime {
  /** The destination a challenge was verified for, read before the command. */
  peekVerifiedDestination(
    db: PostgresJsDatabase,
    input: { challengeId: string; subjectRef: string },
  ): Promise<{ channel: "email" | "sms"; destination: string } | null>
  /** Spend it inside the create transaction, single-use. */
  consume(
    tx: PostgresJsDatabase,
    input: {
      challengeId: string
      subjectRef: string
      /** The destination the peek established; re-checked when spending. */
      destination: string
      consumedRef: string
    },
  ): Promise<{ status: "consumed"; destination: string } | { status: "rejected" }>
}

export const bookingsAccommodationRuntimePort = objectPort<BookingsAccommodationRuntime>(
  "bookings.accommodation.runtime",
  ["enrichOverviewItems"],
)
export const bookingsFinanceRuntimePort = objectPort<BookingsFinanceRuntime>(
  "bookings.finance.runtime",
  ["createStaleBookingHoldsJobRuntime"],
)
export const bookingsInventoryRuntimePort = objectPort<BookingsInventoryRuntime>(
  "bookings.inventory.runtime",
  ["resolveProductSnapshot"],
)
export const bookingsRelationshipsRuntimePort = objectPort<BookingsRelationshipsRuntime>(
  "bookings.relationships.runtime",
  ["loadPersonTravelSnapshot", "upsertPersonFromContact", "getPersonById", "getOrganizationById"],
)
export const bookingsSelfServiceCreateRuntimePort = objectPort<BookingsSelfServiceCreateRuntime>(
  "bookings.self-service-create.runtime",
  ["createFromDraft"],
)
export const bookingsGuestVerificationRuntimePort = objectPort<BookingsGuestVerificationRuntime>(
  "bookings.guest-verification.runtime",
  ["peekVerifiedDestination", "consume"],
)
