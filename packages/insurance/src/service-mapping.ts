/**
 * Row → wire projections.
 *
 * Kept apart from the services so the decision that matters here is visible in
 * one place: whether identity data is revealed. Every insured-person projection
 * goes through `toInsuranceInsuredPersonWire`, which takes the decision as an
 * argument rather than reading a scope itself — a mapper that could consult
 * ambient authority is a mapper that will eventually be called from somewhere
 * that has none.
 */

import type { InsuranceCover, InsuranceDocument } from "@voyant-travel/insurance-contracts"

import type { DecryptedInsuranceInsuredPerson } from "./pii.js"
import { redactInsuredIdentity } from "./pii-redaction.js"
import type { InsuranceApplicationRow } from "./schema-applications.js"
import type { InsuranceInsuredPersonRow } from "./schema-insured-persons.js"
import type { InsurancePolicyRow } from "./schema-policies.js"
import type {
  InsuranceApplicationWire,
  InsuranceInsuredPersonWire,
  InsurancePolicyWire,
} from "./validation.js"

export interface InsuredPersonProjection {
  row: InsuranceInsuredPersonRow
  /** Present only when the caller already decided identity data may be read. */
  decrypted?: DecryptedInsuranceInsuredPerson | null
}

export function toInsuranceInsuredPersonWire(
  projection: InsuredPersonProjection,
  reveal: boolean,
): InsuranceInsuredPersonWire {
  const { row, decrypted } = projection
  const identity = decrypted?.identity ?? null

  if (!row.identityEncrypted) {
    return {
      id: row.id,
      applicationId: row.applicationId,
      policyId: row.policyId ?? null,
      ref: row.ref,
      displayInitial: row.displayInitial ?? null,
      bookingTravelerId: row.bookingTravelerId ?? null,
      identityVisibility: "absent",
      identity: null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  const base = {
    id: row.id,
    applicationId: row.applicationId,
    policyId: row.policyId ?? null,
    ref: row.ref,
    displayInitial: row.displayInitial ?? null,
    bookingTravelerId: row.bookingTravelerId ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }

  if (!reveal || !identity) {
    return {
      ...base,
      identityVisibility: "redacted",
      identity: identity
        ? redactInsuredIdentity({
            givenName: identity.givenName,
            familyName: identity.familyName,
            dateOfBirth: identity.dateOfBirth,
            residencyCountry: identity.residencyCountry ?? null,
            identityDocuments: identity.identityDocuments,
          })
        : null,
    }
  }

  return {
    ...base,
    identityVisibility: "revealed",
    identity: {
      givenName: identity.givenName,
      familyName: identity.familyName,
      dateOfBirth: identity.dateOfBirth,
      residencyCountry: identity.residencyCountry ?? null,
      identityDocuments: identity.identityDocuments,
    },
  }
}

export function toInsuranceApplicationWire(
  row: InsuranceApplicationRow,
  insuredPersons: readonly InsuranceInsuredPersonWire[] = [],
): InsuranceApplicationWire {
  return {
    id: row.id,
    bookingId: row.bookingId ?? null,
    bookingSessionId: row.bookingSessionId ?? null,
    sourceId: row.sourceId,
    providerId: row.providerId,
    providerApplicationRef: row.providerApplicationRef ?? null,
    quoteRef: row.quoteRef,
    title: row.title,
    planName: row.planName ?? null,
    planLabel: row.planLabel ?? null,
    status: row.status,
    expiresAt: row.expiresAt.toISOString(),
    premium: { amountMinor: row.premiumAmountMinor, currency: row.premiumCurrency },
    eligibility: {
      status: row.eligibilityStatus as InsuranceApplicationWire["eligibility"]["status"],
      reasons: row.eligibilityReasons.map((reason) => ({
        code: reason.code,
        message: reason.message,
      })),
    },
    selectedOptionalCoverIds: [...row.selectedOptionalCoverIds],
    acceptedDisclosures: row.acceptedDisclosures.map((entry) => ({ ...entry })),
    insuredPersons: [...insuredPersons],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function toInsurancePolicyWire(row: InsurancePolicyRow): InsurancePolicyWire {
  return {
    id: row.id,
    applicationId: row.applicationId,
    bookingId: row.bookingId ?? null,
    providerId: row.providerId,
    policyNumber: row.policyNumber ?? null,
    issueState: row.issueState,
    issuedAt: row.issuedAt?.toISOString() ?? null,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    premium: { amountMinor: row.premiumAmountMinor, currency: row.premiumCurrency },
    sumInsured:
      row.sumInsuredAmountMinor !== null && row.sumInsuredCurrency !== null
        ? { amountMinor: row.sumInsuredAmountMinor, currency: row.sumInsuredCurrency }
        : null,
    covers: [...row.covers] as InsuranceCover[],
    documents: [...row.documents] as InsuranceDocument[],
    failure:
      row.failureCode && row.failureMessage && row.failureOccurredAt
        ? {
            code: row.failureCode,
            message: row.failureMessage,
            retryable: row.failureRetryable ?? false,
            occurredAt: row.failureOccurredAt.toISOString(),
          }
        : null,
    cancellation:
      row.cancelledAt && row.cancellationReason
        ? {
            cancelledAt: row.cancelledAt.toISOString(),
            reason: row.cancellationReason,
            refund:
              row.refundAmountMinor !== null && row.refundCurrency !== null
                ? { amountMinor: row.refundAmountMinor, currency: row.refundCurrency }
                : null,
          }
        : null,
    issueAttempts: row.issueAttempts,
    providerReference: row.providerReference ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
