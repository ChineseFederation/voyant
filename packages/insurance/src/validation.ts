/**
 * Wire shapes for the insurance admin surface.
 *
 * Row schemas are authored from the Drizzle `$inferSelect` shapes with dates and
 * timestamps as strings, the way every other module's route schemas are. The
 * money fields stay split into `amountMinor` + `currency` objects on the wire
 * even though the columns are separate, because that is the shape
 * `insurance-contracts` fixed and the shape a reconciliation reads.
 *
 * Nothing here can express an identity in the clear by accident: the insured
 * person shape carries `identity` as an optional object, and the route only
 * populates it for a caller holding `insurance-pii:read`.
 */

import {
  INSURANCE_APPLICATION_STATUSES,
  INSURANCE_ELIGIBILITY_STATUSES,
  INSURANCE_POLICY_ISSUE_STATES,
  insuranceCoverSchema,
  insuranceDateSchema,
  insuranceDocumentSchema,
  insuranceEligibilityReasonCodeSchema,
  insuranceIdentityDocumentSchema,
  insuranceMoneySchema,
} from "@voyant-travel/insurance-contracts"
import { z } from "zod"

export const insuranceApplicationStatusWireSchema = z.enum(INSURANCE_APPLICATION_STATUSES)
export const insurancePolicyIssueStateWireSchema = z.enum(INSURANCE_POLICY_ISSUE_STATES)
export const insuranceEligibilityStatusWireSchema = z.enum(INSURANCE_ELIGIBILITY_STATUSES)

/**
 * A reason as it leaves the API.
 *
 * `code` is loosened to a plain string rather than the contract enum because an
 * insurer's own reason code is stored verbatim alongside ours and a consumer
 * that hard-fails on an unrecognised one would break the day an insurer adds
 * a refusal category. The enum is still exported for callers that want to
 * branch exhaustively on the known set.
 */
export const insuranceEligibilityReasonWireSchema = z
  .object({ code: z.string(), message: z.string() })
  .strict()

export { insuranceEligibilityReasonCodeSchema }

/** The identity block, present only for a caller holding `insurance-pii:read`. */
export const insuranceInsuredIdentityWireSchema = z
  .object({
    givenName: z.string().nullable(),
    familyName: z.string().nullable(),
    dateOfBirth: z.string().nullable(),
    residencyCountry: z.string().nullable().optional(),
    identityDocuments: z.array(insuranceIdentityDocumentSchema.partial().passthrough()).default([]),
  })
  .strict()

export const insuranceInsuredPersonWireSchema = z
  .object({
    id: z.string(),
    applicationId: z.string(),
    policyId: z.string().nullable(),
    ref: z.string(),
    displayInitial: z.string().nullable(),
    bookingTravelerId: z.string().nullable(),
    /**
     * `redacted` when the caller lacks the scope, `revealed` when it holds it,
     * and `absent` when nothing was ever stored. Three states rather than two so
     * a UI can say "you cannot see this" instead of "there is nothing here".
     */
    identityVisibility: z.enum(["absent", "redacted", "revealed"]),
    identity: insuranceInsuredIdentityWireSchema.nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict()

export type InsuranceInsuredPersonWire = z.infer<typeof insuranceInsuredPersonWireSchema>

export const insuranceApplicationWireSchema = z
  .object({
    id: z.string(),
    bookingId: z.string().nullable(),
    bookingSessionId: z.string().nullable(),
    sourceId: z.string(),
    providerId: z.string(),
    providerApplicationRef: z.string().nullable(),
    quoteRef: z.string(),
    title: z.string(),
    planName: z.string().nullable(),
    planLabel: z.string().nullable(),
    status: insuranceApplicationStatusWireSchema,
    expiresAt: z.string(),
    premium: insuranceMoneySchema,
    eligibility: z
      .object({
        status: insuranceEligibilityStatusWireSchema,
        reasons: z.array(insuranceEligibilityReasonWireSchema).default([]),
      })
      .strict(),
    selectedOptionalCoverIds: z.array(z.string()).default([]),
    acceptedDisclosures: z
      .array(z.object({ kind: z.string(), versionId: z.string(), acceptedAt: z.string() }).strict())
      .default([]),
    insuredPersons: z.array(insuranceInsuredPersonWireSchema).default([]),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict()

export type InsuranceApplicationWire = z.infer<typeof insuranceApplicationWireSchema>

export const insurancePolicyFailureWireSchema = z
  .object({
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
    occurredAt: z.string(),
  })
  .strict()

export const insurancePolicyCancellationWireSchema = z
  .object({
    cancelledAt: z.string(),
    reason: z.string(),
    refund: insuranceMoneySchema.nullable(),
  })
  .strict()

export const insurancePolicyWireSchema = z
  .object({
    id: z.string(),
    applicationId: z.string(),
    bookingId: z.string().nullable(),
    providerId: z.string(),
    policyNumber: z.string().nullable(),
    issueState: insurancePolicyIssueStateWireSchema,
    issuedAt: z.string().nullable(),
    effectiveFrom: insuranceDateSchema,
    effectiveTo: insuranceDateSchema,
    premium: insuranceMoneySchema,
    sumInsured: insuranceMoneySchema.nullable(),
    covers: z.array(insuranceCoverSchema).default([]),
    documents: z.array(insuranceDocumentSchema).default([]),
    failure: insurancePolicyFailureWireSchema.nullable(),
    cancellation: insurancePolicyCancellationWireSchema.nullable(),
    issueAttempts: z.number().int(),
    providerReference: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict()

export type InsurancePolicyWire = z.infer<typeof insurancePolicyWireSchema>

export const bookingInsuranceParamsSchema = z.object({ bookingId: z.string().min(1) }).strict()
export const applicationParamsSchema = z.object({ applicationId: z.string().min(1) }).strict()
export const policyParamsSchema = z.object({ policyId: z.string().min(1) }).strict()

/**
 * Retrying an issue takes a reason, not a payload.
 *
 * The application already holds everything the insurer needs; anything a caller
 * could send here would be a second, divergent version of it. So the body says
 * only why a human is asking again, which is what the activity log records.
 */
export const retryInsuranceIssueSchema = z
  .object({ reason: z.string().min(1).max(500).optional() })
  .strict()

export type RetryInsuranceIssueInput = z.infer<typeof retryInsuranceIssueSchema>

export const cancelInsurancePolicySchema = z.object({ reason: z.string().min(1).max(500) }).strict()

export type CancelInsurancePolicyInput = z.infer<typeof cancelInsurancePolicySchema>

export const insuranceBookingOverviewSchema = z
  .object({
    bookingId: z.string(),
    applications: z.array(insuranceApplicationWireSchema).default([]),
    policies: z.array(insurancePolicyWireSchema).default([]),
  })
  .strict()

export type InsuranceBookingOverview = z.infer<typeof insuranceBookingOverviewSchema>

export const insuranceErrorSchema = z.object({ error: z.string() }).catchall(z.unknown())
