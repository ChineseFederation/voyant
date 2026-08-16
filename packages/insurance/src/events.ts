/**
 * Emitting what the manifest declares.
 *
 * The four event contracts in `voyant.ts` carry redaction metadata that only
 * means anything if something actually publishes them — a declared event that
 * is never emitted is a subscription an operator can configure and never
 * receive. So the emitters live here, next to the payload shapes they have to
 * satisfy, rather than being spelled out at four call sites that can each drift
 * from the schema independently.
 *
 * Every payload is `additionalProperties: false` in the manifest, so these
 * builders return exactly the declared fields and nothing else. Two of those
 * fields are redacted downstream (`policyNumber`, `failureMessage`); see the
 * manifest for why neither is as harmless as it looks.
 *
 * Emission is fire-and-forget by the bus's own contract, and the bus is
 * optional here: a deployment that binds no bus still issues policies.
 */

import type { EventBus } from "@voyant-travel/core"

/**
 * One flat constant per event type, and the emit calls below name them
 * directly.
 *
 * A nested map read as `TYPES.policyIssued` at the call site would be tidier to
 * look at and invisible to `verify:phase5-event-authority`, which matches a
 * literal or a top-level SCREAMING constant at the `.emit(` call. That checker
 * is what stops a module declaring four event contracts and emitting none —
 * which is exactly the state this file was written to fix.
 */
export const INSURANCE_APPLICATION_OPENED_EVENT = "insurance.application.opened"
export const INSURANCE_POLICY_ISSUED_EVENT = "insurance.policy.issued"
export const INSURANCE_POLICY_ISSUE_FAILED_EVENT = "insurance.policy.issue-failed"
export const INSURANCE_POLICY_CANCELLED_EVENT = "insurance.policy.cancelled"

export const INSURANCE_EVENT_TYPES = {
  applicationOpened: INSURANCE_APPLICATION_OPENED_EVENT,
  policyIssued: INSURANCE_POLICY_ISSUED_EVENT,
  policyIssueFailed: INSURANCE_POLICY_ISSUE_FAILED_EVENT,
  policyCancelled: INSURANCE_POLICY_CANCELLED_EVENT,
} as const

const METADATA = { category: "domain", source: "service" } as const

export interface InsuranceApplicationOpenedPayload {
  applicationId: string
  bookingSessionId: string | null
  providerId: string
  premiumAmountMinor: number
  premiumCurrency: string
  insuredPersonCount: number
}

export interface InsurancePolicyIssuedPayload {
  policyId: string
  applicationId: string
  bookingId: string | null
  providerId: string
  policyNumber: string | null
  premiumAmountMinor: number
  premiumCurrency: string
}

export interface InsurancePolicyIssueFailedPayload {
  policyId: string
  applicationId: string
  bookingId: string | null
  providerId: string
  failureCode: string
  failureMessage: string
  retryable: boolean
  paid: boolean
}

export interface InsurancePolicyCancelledPayload {
  policyId: string
  bookingId: string | null
  providerId: string
  reason: string
  refundAmountMinor: number | null
  refundCurrency: string | null
}

export async function emitInsuranceApplicationOpened(
  bus: EventBus | undefined,
  payload: InsuranceApplicationOpenedPayload,
): Promise<void> {
  await bus?.emit(INSURANCE_APPLICATION_OPENED_EVENT, payload, METADATA)
}

export async function emitInsurancePolicyIssued(
  bus: EventBus | undefined,
  payload: InsurancePolicyIssuedPayload,
): Promise<void> {
  await bus?.emit(INSURANCE_POLICY_ISSUED_EVENT, payload, METADATA)
}

export async function emitInsurancePolicyIssueFailed(
  bus: EventBus | undefined,
  payload: InsurancePolicyIssueFailedPayload,
): Promise<void> {
  await bus?.emit(INSURANCE_POLICY_ISSUE_FAILED_EVENT, payload, METADATA)
}

export async function emitInsurancePolicyCancelled(
  bus: EventBus | undefined,
  payload: InsurancePolicyCancelledPayload,
): Promise<void> {
  await bus?.emit(INSURANCE_POLICY_CANCELLED_EVENT, payload, METADATA)
}
