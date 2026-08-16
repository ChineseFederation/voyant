/**
 * What the deployment has to supply, and what it may consume.
 *
 * Two ports, pointing opposite ways.
 *
 * `insurance.runtime` is the one this module REQUIRES. It carries the KMS
 * provider (a deployment fact — this package must not decide where keys live)
 * and the booking-facing callbacks: recording a document, delivering it, and
 * raising a staff alert. Those are callbacks rather than imports because
 * `@voyant-travel/notifications` may not read another module's tables, so the
 * seam runs the other way: the owning module declares the shape and the
 * deployment satisfies it.
 *
 * `insurance.customer-portal-policies` is the one this module PROVIDES, so a
 * traveller can see their own policy through the customer portal that already
 * exists rather than through a new public API surface. The portal reads it; if
 * nothing binds it, nothing happens.
 */

import type { EventBus } from "@voyant-travel/core"
import { definePort } from "@voyant-travel/core/project"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import type { InsuranceBookingIntegration } from "./booking-integration.js"
import type { InsurancePiiService } from "./pii.js"

export interface InsuranceRuntime {
  /**
   * The audited encrypt/decrypt service. Constructed by the deployment because
   * only it knows the KMS configuration and where the audit trail goes.
   */
  createPiiService(): InsurancePiiService
  /** Booking documents, notifications, staff alerts. Every part optional. */
  bookingIntegration(): InsuranceBookingIntegration
  /**
   * Where this module's declared events go.
   *
   * Optional, and deliberately not part of the port's structural check: a
   * deployment that binds no bus still issues policies, and failing the port
   * over a missing subscriber would make the whole module unavailable to
   * satisfy something nobody is listening to.
   */
  eventBus?(): EventBus | undefined
}

export const insuranceRuntimePort = definePort<InsuranceRuntime>({
  id: "insurance.runtime",
  test(provider) {
    if (provider === null || typeof provider !== "object") {
      throw new Error("insurance.runtime provider must be an options object.")
    }
    for (const method of ["createPiiService", "bookingIntegration"] as const) {
      if (typeof provider[method] !== "function") {
        throw new Error(`insurance.runtime provider must implement ${method}().`)
      }
    }
  },
})

/** One policy as a traveller sees their own. Nothing identifying, by design. */
export interface CustomerPortalInsurancePolicy {
  policyId: string
  providerId: string
  policyNumber: string | null
  effectiveFrom: string
  effectiveTo: string
  premium: { amountMinor: number; currency: string }
  sumInsured: { amountMinor: number; currency: string } | null
  covers: ReadonlyArray<{ category: string; label: string; included: boolean }>
  documents: ReadonlyArray<{ documentId: string; kind: string; filename: string }>
}

/**
 * The portal's read of a booking's insurance.
 *
 * `bookingId` is supplied by the portal AFTER it has established that the
 * signed-in traveller owns that booking. This port does no ownership check of
 * its own and must not be given one: two places deciding who owns a booking is
 * how they come to disagree.
 */
export interface InsuranceCustomerPortalReader {
  listPoliciesForBooking(
    db: PostgresJsDatabase,
    bookingId: string,
  ): Promise<readonly CustomerPortalInsurancePolicy[]>
}

export const insuranceCustomerPortalPort = definePort<InsuranceCustomerPortalReader>({
  id: "insurance.customer-portal-policies",
  test(provider) {
    if (provider === null || typeof provider !== "object") {
      throw new Error("insurance.customer-portal-policies provider must be an object.")
    }
    if (typeof provider.listPoliciesForBooking !== "function") {
      throw new Error(
        "insurance.customer-portal-policies provider must implement listPoliciesForBooking().",
      )
    }
  },
})
