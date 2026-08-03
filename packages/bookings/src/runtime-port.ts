import type {
  BookingAmendmentFinancialConsequences,
  BookingAmendmentPrice,
} from "@voyant-travel/bookings-contracts"
import type {
  BookingActionListQuery,
  BookingActionRecord,
  BookingActionSourceSnapshot,
  BookingActionSyncMode,
  BookingActionSyncSummary,
  PublicBookingActionRecord,
} from "@voyant-travel/bookings-contracts/booking-actions"
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
  quoteBookingAmendment(
    db: PostgresJsDatabase,
    input: {
      bookingId: string
      currency: string
      lines: ReadonlyArray<{
        bookingItemId: string
        productId: string | null
        subtotalDeltaCents: number
      }>
    },
  ): Promise<{
    price: BookingAmendmentPrice
    consequences: BookingAmendmentFinancialConsequences
    policyVersion: string
  }>
  recordBookingAmendment(
    tx: PostgresJsDatabase,
    input: {
      amendmentId: string
      bookingId: string
      idempotencyKey: string
      price: BookingAmendmentPrice
      consequences: BookingAmendmentFinancialConsequences
      reason: string
    },
  ): Promise<{ adjustmentId: string; status: "recorded" | "replay" }>
}

export interface BookingSupplierAmendmentOperationInput {
  bookingItemId: string
  entityModule: string
  entityId: string
  sourceKind: string
  sourceConnectionId: string
  sourceRef: string
  upstreamRef: string
  desiredState: {
    parameters?: Record<string, unknown>
    party: { passengers: ReadonlyArray<Record<string, unknown>> }
  }
  requestFingerprint: string
}

export interface BookingsSupplierAmendmentRuntime {
  dispatch(input: {
    db: PostgresJsDatabase
    amendmentId: string
    bookingId: string
    idempotencyKey: string
    operations: ReadonlyArray<BookingSupplierAmendmentOperationInput>
    now: Date
  }): Promise<
    ReadonlyArray<{
      bookingItemId: string
      supplierOperationId: string | null
      outcome: "secured" | "pending" | "in_doubt" | "refused" | "idempotency_conflict"
    }>
  >
  reconcile(input: {
    db: PostgresJsDatabase
    supplierOperationIds: ReadonlyArray<string>
    now: Date
  }): Promise<
    ReadonlyArray<{
      bookingItemId: string
      supplierOperationId: string | null
      outcome: "secured" | "pending" | "in_doubt" | "refused" | "idempotency_conflict"
    }>
  >
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

/**
 * A module-owned reader of current authoritative obligations.
 *
 * Implementations must reread source tables and return their current state;
 * event payloads are only wake-up signals and must never be projected as
 * authority. The `sourceModule/sourceType/sourceId` tuple must be stable.
 */
export interface BookingActionSourceRuntime {
  id: string
  sourceModule: string
  read(
    db: PostgresJsDatabase,
    options: { changedAfter?: Date },
  ): Promise<ReadonlyArray<BookingActionSourceSnapshot>>
}

export interface BookingActionProjectionService {
  synchronize(
    sources: ReadonlyArray<BookingActionSourceRuntime>,
    mode: BookingActionSyncMode,
  ): Promise<BookingActionSyncSummary>
  listStaff(query: BookingActionListQuery): Promise<{
    data: BookingActionRecord[]
    count: number
    limit: number
    offset: number
    asOf: string
  }>
  listCustomer(bookingId: string): Promise<{
    data: PublicBookingActionRecord[]
    asOf: string
  }>
  getDeadlineBySource(input: {
    sourceModule: string
    sourceType: string
    sourceId: string
  }): Promise<{
    dueAt: string
    timeZone: string
    deadlineSemantics: "instant" | "local_date_end"
  } | null>
  getDeadlinesBySource(input: {
    sourceModule: string
    sourceType: string
    sourceIds: ReadonlyArray<string>
  }): Promise<ReadonlyMap<string, string>>
}

/** Operations-owned read/projection boundary consumed by API and reminder modules. */
export interface BookingActionProjectionRuntime {
  create(db: PostgresJsDatabase): BookingActionProjectionService
  synchronize(
    sources: ReadonlyArray<BookingActionSourceRuntime>,
    mode: BookingActionSyncMode,
  ): Promise<BookingActionSyncSummary>
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

export const bookingsAccommodationRuntimePort = objectPort<BookingsAccommodationRuntime>(
  "bookings.accommodation.runtime",
  ["enrichOverviewItems"],
)
export const bookingsFinanceRuntimePort = objectPort<BookingsFinanceRuntime>(
  "bookings.finance.runtime",
  ["createStaleBookingHoldsJobRuntime", "quoteBookingAmendment", "recordBookingAmendment"],
)
export const bookingsSupplierAmendmentRuntimePort = objectPort<BookingsSupplierAmendmentRuntime>(
  "bookings.supplier-amendment.runtime",
  ["dispatch", "reconcile"],
)
export const bookingsInventoryRuntimePort = objectPort<BookingsInventoryRuntime>(
  "bookings.inventory.runtime",
  ["resolveProductSnapshot"],
)
export const bookingsRelationshipsRuntimePort = objectPort<BookingsRelationshipsRuntime>(
  "bookings.relationships.runtime",
  ["loadPersonTravelSnapshot", "upsertPersonFromContact", "getPersonById", "getOrganizationById"],
)
export const bookingActionSourceRuntimePort = objectPort<BookingActionSourceRuntime>(
  "bookings.booking-action-source.runtime",
  ["read"],
)
export const bookingActionProjectionRuntimePort = objectPort<BookingActionProjectionRuntime>(
  "bookings.booking-action-projection.runtime",
  ["create", "synchronize"],
)
