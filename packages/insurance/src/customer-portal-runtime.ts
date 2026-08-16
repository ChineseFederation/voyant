/**
 * A traveller reading their own policy.
 *
 * Deliberately NOT a new public API surface. A policy is attached to a booking,
 * and the customer portal already knows how to prove a signed-in traveller owns
 * a booking; adding a second surface would mean a second implementation of that
 * proof, which is the sort of thing that stays right for about a year.
 *
 * So this is a contribution the portal reads through
 * `insurance.customer-portal-policies`, and it is deliberately incapable of
 * answering "whose booking is this?" — it takes a booking id the portal already
 * authorised and returns only what a traveller may see.
 *
 * What a traveller may see is narrower than what an operator may. There is no
 * insured-person list here at all: a policy holder does not need the platform
 * to read their own passport number back to them, and a shape that cannot carry
 * one cannot leak one.
 */

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import type {
  CustomerPortalInsurancePolicy,
  InsuranceCustomerPortalReader,
} from "./runtime-port.js"
import { listIssuedInsurancePoliciesForBooking } from "./service-policies.js"

export function createInsuranceCustomerPortalReader(): InsuranceCustomerPortalReader {
  return {
    async listPoliciesForBooking(
      db: PostgresJsDatabase,
      bookingId: string,
    ): Promise<readonly CustomerPortalInsurancePolicy[]> {
      // Only `issued`. A pending or failed attempt is an operational state the
      // traveller can do nothing about, and showing it as a policy would tell
      // them they are covered when they are not.
      const rows = await listIssuedInsurancePoliciesForBooking(db, bookingId)

      return rows.map((row) => ({
        policyId: row.id,
        providerId: row.providerId,
        policyNumber: row.policyNumber ?? null,
        effectiveFrom: row.effectiveFrom,
        effectiveTo: row.effectiveTo,
        premium: { amountMinor: row.premiumAmountMinor, currency: row.premiumCurrency },
        sumInsured:
          row.sumInsuredAmountMinor !== null && row.sumInsuredCurrency !== null
            ? { amountMinor: row.sumInsuredAmountMinor, currency: row.sumInsuredCurrency }
            : null,
        covers: row.covers.map((cover) => ({
          category: cover.category,
          label: cover.label,
          included: cover.included,
        })),
        documents: row.documents.map((document) => ({
          documentId: document.documentId,
          kind: document.kind,
          filename: document.filename,
        })),
      }))
    },
  }
}
