import { z } from "zod"
import { insuranceContractingPartySchema, insuranceInsuredPersonSchema } from "./application.js"
import { insuranceCoverSchema } from "./cover.js"
import { insuranceDocumentSchema } from "./document.js"
import { insuranceDateSchema, insuranceInstantSchema, insuranceMoneySchema } from "./money.js"

export const INSURANCE_POLICY_ISSUE_STATES = [
  "pending",
  "issued",
  "issue_failed",
  "cancelled",
] as const

export type InsurancePolicyIssueState = (typeof INSURANCE_POLICY_ISSUE_STATES)[number]

export const insurancePolicyIssueStateSchema = z.enum(INSURANCE_POLICY_ISSUE_STATES)

export const insurancePolicyFailureSchema = z
  .object({
    /** Stable enough to branch on; the message is what a human reads. */
    code: z.string().min(1),
    message: z.string().min(1),
    /**
     * Whether asking again could succeed. An insurer that declined the risk is
     * not retryable; a timeout is. Getting this wrong either strands a paid
     * traveller or hammers an insurer with a request it has already refused.
     */
    retryable: z.boolean(),
    occurredAt: insuranceInstantSchema,
  })
  .strict()

export type InsurancePolicyFailure = z.infer<typeof insurancePolicyFailureSchema>

export const insurancePolicyCancellationSchema = z
  .object({
    cancelledAt: insuranceInstantSchema,
    reason: z.string().min(1),
    /** What the insurer returned, when it returned anything. */
    refund: insuranceMoneySchema.optional(),
    providerReference: z.string().optional(),
  })
  .strict()

export type InsurancePolicyCancellation = z.infer<typeof insurancePolicyCancellationSchema>

export const insurancePolicySchema = z
  .object({
    policyId: z.string().min(1),
    providerId: z.string().min(1),
    applicationId: z.string().min(1),
    /**
     * The insurer's number, which is what a traveller quotes when they claim.
     * Absent until the policy is actually issued.
     */
    policyNumber: z.string().optional(),
    issueState: insurancePolicyIssueStateSchema,
    issuedAt: insuranceInstantSchema.optional(),
    /** The window the policy actually covers, which is not the trip window. */
    effectiveFrom: insuranceDateSchema,
    effectiveTo: insuranceDateSchema,
    /**
     * What the insurer charged. This has to equal the premium line on the
     * booking exactly: the traveller reads both documents and any drift between
     * them is visible.
     */
    premium: insuranceMoneySchema,
    sumInsured: insuranceMoneySchema.optional(),
    covers: z.array(insuranceCoverSchema).default([]),
    insuredPersons: z.array(insuranceInsuredPersonSchema).min(1),
    contractingParty: insuranceContractingPartySchema,
    documents: z.array(insuranceDocumentSchema).default([]),
    failure: insurancePolicyFailureSchema.optional(),
    cancellation: insurancePolicyCancellationSchema.optional(),
    providerReference: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.issueState === "issued" && !value.policyNumber) {
      ctx.addIssue({
        code: "custom",
        path: ["policyNumber"],
        message: "an issued policy must carry the insurer's policy number",
      })
    }
    if (value.issueState === "issue_failed" && !value.failure) {
      ctx.addIssue({
        code: "custom",
        path: ["failure"],
        message: "a failed issue must carry the reason it failed",
      })
    }
    if (value.issueState === "cancelled" && !value.cancellation) {
      ctx.addIssue({
        code: "custom",
        path: ["cancellation"],
        message: "a cancelled policy must carry its cancellation",
      })
    }
    if (value.effectiveTo < value.effectiveFrom) {
      ctx.addIssue({
        code: "custom",
        path: ["effectiveTo"],
        message: "effectiveTo must not precede effectiveFrom",
      })
    }
  })

export type InsurancePolicy = z.infer<typeof insurancePolicySchema>

/** The certificate the traveller carries, when the insurer has produced it. */
export function policyCertificate(policy: InsurancePolicy) {
  return policy.documents.find((document) => document.kind === "policy_certificate") ?? null
}
