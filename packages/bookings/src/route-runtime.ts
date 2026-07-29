import type { CustomFieldRegistryResolver } from "@voyant-travel/core/custom-fields"
import { createKmsProviderFromEnv, type KmsProvider } from "@voyant-travel/utils/kms"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { resolveMonthlyBookingLimit } from "./booking-plan-limit.js"
import type { BookingTravelerSnapshot } from "./pii.js"
import type { KmsBindings } from "./routes-shared.js"
import type { BookingStatus } from "./state-machine.js"

export const BOOKING_ROUTE_RUNTIME_CONTAINER_KEY = "runtime.bookings.routes"

/**
 * Resolver invoked by the booking-traveler "with travel details"
 * route when `data.personId` is provided. Returns a plaintext
 * snapshot of the linked person's dietary / accessibility / primary
 * passport values, decrypted server-side via the same KMS provider
 * the route already resolved. Templates wire this from
 * `relationshipsService.loadPersonTravelSnapshot` so the bookings package
 * stays free of any direct CRM dependency.
 */
export type ResolveBookingTravelSnapshot = (
  db: PostgresJsDatabase,
  personId: string,
  ctx: { kms: KmsProvider },
) => Promise<BookingTravelerSnapshot | null>

/**
 * Best-effort contact snapshot an existing booking-session update hands to
 * the caller's person resolver. Mirrors the storefront
 * lead-intake `StorefrontLeadContact` shape so the same resolver can
 * service both surfaces.
 */
export interface BookingPersonResolverContact {
  firstName: string | null
  lastName: string | null
  email: string | null
  phone: string | null
  preferredLanguage: string | null
}

/**
 * Resolves (or upserts) a CRM person from a booking's billing contact
 * snapshot. Returns the resolved person id, or `null` to leave the
 * booking's `person_id` unset. Templates wire this from
 * `relationshipsService.upsertPersonFromContact` so the bookings package stays
 * free of any direct CRM dependency — see issue #961.
 */
export type ResolveBookingBillingPerson = (
  db: PostgresJsDatabase,
  contact: BookingPersonResolverContact,
  ctx: { bookingId: string; source: string; sourceRef: string },
) => Promise<string | null>

/**
 * Resolves (or upserts) a CRM person from a booking traveler payload.
 * Called from `publicBookingsService.updateSession` per traveler so
 * storefront-originated bookings
 * produce CRM person links per traveler (not just for the billing
 * contact). Returns the resolved person id, or `null` to keep
 * `booking_travelers.person_id` unset.
 */
export type ResolveBookingTravelerPerson = (
  db: PostgresJsDatabase,
  contact: BookingPersonResolverContact,
  ctx: { bookingId: string; source: string; sourceRef: string },
) => Promise<string | null>

export type ResolveBookingBillingPersonById = (
  db: PostgresJsDatabase,
  personId: string,
) => Promise<boolean>

export type ResolveBookingBillingOrganizationById = (
  db: PostgresJsDatabase,
  organizationId: string,
) => Promise<boolean>

export type ClosePaymentSchedulesForBooking = (
  db: PostgresJsDatabase,
  bookingId: string,
  status: Extract<BookingStatus, "cancelled" | "expired">,
) => Promise<void> | void

export type RecordCancellationFinancialSettlement = (
  db: PostgresJsDatabase,
  input: {
    bookingId: string
    bookingNumber: string
    previousStatus: Extract<
      BookingStatus,
      "draft" | "on_hold" | "awaiting_payment" | "confirmed" | "in_progress"
    >
    reason: string | null
    actorId: string
  },
) =>
  | Promise<Record<string, unknown> | null | undefined>
  | Record<string, unknown>
  | null
  | undefined

/**
 * Item passed to a public-overview enricher. Carries only the core
 * booking-item fields a vertical package needs to look up its own
 * detail rows — the enricher joins on `id` (the core `booking_items.id`).
 */
export interface BookingOverviewEnricherItem {
  id: string
  itemType: string
  productId: string | null
  optionId: string | null
}

/**
 * Vertical enrichment seam for the public guest-booking overview. A
 * deployment wires one enricher per `booking_item_type` (e.g.
 * `accommodation`). Each enricher is invoked ONCE with all overview items
 * of its type and returns a map keyed by the core `booking_items.id` →
 * an opaque `details` block that is attached to the matching overview
 * item. Kept in the route-runtime so verticals inject their detail joins
 * at composition time without the bookings package importing them
 * (avoids the accommodations→bookings dependency cycle). See issue #2969.
 */
export type BookingOverviewItemEnricher = (
  db: PostgresJsDatabase,
  items: ReadonlyArray<BookingOverviewEnricherItem>,
) => Promise<Map<string, unknown>>

export interface BookingRouteRuntime {
  getKmsProvider(): Promise<KmsProvider>
  monthlyBookingLimit?: number | null
  resolveTravelSnapshot?: ResolveBookingTravelSnapshot
  resolveBillingPerson?: ResolveBookingBillingPerson
  resolveTravelerPerson?: ResolveBookingTravelerPerson
  resolveBillingPersonById?: ResolveBookingBillingPersonById
  resolveBillingOrganizationById?: ResolveBookingBillingOrganizationById
  closePaymentSchedulesForBooking?: ClosePaymentSchedulesForBooking
  recordCancellationFinancialSettlement?: RecordCancellationFinancialSettlement
  /** Transaction-locking registry resolver used by entity writes. */
  customFieldsForWrite?: CustomFieldRegistryResolver
  /** Per-`booking_item_type` public-overview enrichers (issue #2969). */
  overviewItemEnrichers?: Partial<Record<string, BookingOverviewItemEnricher>>
}

/**
 * Hook for apps that source their KMS key material from somewhere other than
 * env vars / wrangler secrets — e.g. Voyant Cloud Vault. Receives the same
 * resolved bindings the default env-driven provider would, returns the
 * provider (sync or async). When omitted, falls back to
 * `createKmsProviderFromEnv` so existing starter wiring keeps working.
 */
export type ResolveBookingKmsProvider = (
  env: Record<string, string | undefined>,
) => KmsProvider | Promise<KmsProvider>

export interface BookingRouteRuntimeOptions {
  resolveKmsProvider?: ResolveBookingKmsProvider
  resolveTravelSnapshot?: ResolveBookingTravelSnapshot
  resolveBillingPerson?: ResolveBookingBillingPerson
  resolveTravelerPerson?: ResolveBookingTravelerPerson
  resolveBillingPersonById?: ResolveBookingBillingPersonById
  resolveBillingOrganizationById?: ResolveBookingBillingOrganizationById
  closePaymentSchedulesForBooking?: ClosePaymentSchedulesForBooking
  recordCancellationFinancialSettlement?: RecordCancellationFinancialSettlement
  customFieldsForWrite?: CustomFieldRegistryResolver
  overviewItemEnrichers?: Partial<Record<string, BookingOverviewItemEnricher>>
}

function buildRuntimeEnv(bindings: KmsBindings): Record<string, string | undefined> {
  const processEnv =
    (
      globalThis as typeof globalThis & {
        process?: { env?: Record<string, string | undefined> }
      }
    ).process?.env ?? {}

  return {
    ...processEnv,
    ...(bindings ?? {}),
  }
}

export function buildBookingRouteRuntime(
  bindings: KmsBindings,
  options: BookingRouteRuntimeOptions = {},
): BookingRouteRuntime {
  const runtimeEnv = buildRuntimeEnv(bindings)

  return {
    monthlyBookingLimit: resolveMonthlyBookingLimit(runtimeEnv),
    async getKmsProvider() {
      if (options.resolveKmsProvider) {
        return options.resolveKmsProvider(runtimeEnv)
      }
      return createKmsProviderFromEnv(runtimeEnv)
    },
    resolveTravelSnapshot: options.resolveTravelSnapshot,
    resolveBillingPerson: options.resolveBillingPerson,
    resolveTravelerPerson: options.resolveTravelerPerson,
    resolveBillingPersonById: options.resolveBillingPersonById,
    resolveBillingOrganizationById: options.resolveBillingOrganizationById,
    closePaymentSchedulesForBooking: options.closePaymentSchedulesForBooking,
    recordCancellationFinancialSettlement: options.recordCancellationFinancialSettlement,
    customFieldsForWrite: options.customFieldsForWrite,
    overviewItemEnrichers: options.overviewItemEnrichers,
  }
}
