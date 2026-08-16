import { queryOptions } from "@tanstack/react-query"
import { z } from "zod"

import { type FetchWithValidationOptions, fetchWithValidation } from "./client.js"
import { insuranceQueryKeys } from "./query-keys.js"

/**
 * Local mirrors of the admin wire shapes.
 *
 * Declared here rather than imported from `@voyant-travel/insurance`: that
 * package pulls Drizzle and Hono, and a browser bundle must not reach either
 * (`verify:boundary` enforces it). The cost is that these can drift, which is
 * why every response is parsed rather than cast — drift surfaces as a failed
 * parse in development instead of an undefined premium in production.
 */
export const insuranceMoneyClientSchema = z
  .object({ amountMinor: z.number().int(), currency: z.string() })
  .strict()

export const insuranceInsuredPersonClientSchema = z.object({
  id: z.string(),
  applicationId: z.string(),
  policyId: z.string().nullable(),
  ref: z.string(),
  displayInitial: z.string().nullable(),
  bookingTravelerId: z.string().nullable(),
  /**
   * Three states, not two. `redacted` means the caller lacks
   * `insurance-pii:read`; `absent` means nothing was ever stored. A UI that
   * conflated them would tell an operator there is no insured person when in
   * fact they simply may not see them.
   */
  identityVisibility: z.enum(["absent", "redacted", "revealed"]),
  identity: z
    .object({
      givenName: z.string().nullable(),
      familyName: z.string().nullable(),
      dateOfBirth: z.string().nullable(),
      residencyCountry: z.string().nullable().optional(),
      identityDocuments: z
        .array(
          z.object({
            type: z.string().optional(),
            number: z.string().optional(),
            issuingCountry: z.string().optional(),
            expiresAt: z.string().optional(),
          }),
        )
        .default([]),
    })
    .nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type InsuranceInsuredPersonRecord = z.infer<typeof insuranceInsuredPersonClientSchema>

export const insuranceApplicationClientSchema = z.object({
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
  status: z.enum(["open", "submitted", "accepted", "declined", "expired", "withdrawn"]),
  expiresAt: z.string(),
  premium: insuranceMoneyClientSchema,
  eligibility: z.object({
    status: z.enum(["eligible", "ineligible", "referral"]),
    reasons: z.array(z.object({ code: z.string(), message: z.string() })).default([]),
  }),
  selectedOptionalCoverIds: z.array(z.string()).default([]),
  acceptedDisclosures: z
    .array(z.object({ kind: z.string(), versionId: z.string(), acceptedAt: z.string() }))
    .default([]),
  insuredPersons: z.array(insuranceInsuredPersonClientSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type InsuranceApplicationRecord = z.infer<typeof insuranceApplicationClientSchema>

export const insurancePolicyClientSchema = z.object({
  id: z.string(),
  applicationId: z.string(),
  bookingId: z.string().nullable(),
  providerId: z.string(),
  policyNumber: z.string().nullable(),
  issueState: z.enum(["pending", "issued", "issue_failed", "cancelled"]),
  issuedAt: z.string().nullable(),
  effectiveFrom: z.string(),
  effectiveTo: z.string(),
  premium: insuranceMoneyClientSchema,
  sumInsured: insuranceMoneyClientSchema.nullable(),
  covers: z
    .array(
      z.object({
        category: z.string(),
        label: z.string(),
        included: z.boolean(),
        sumInsured: insuranceMoneyClientSchema.optional(),
        excess: insuranceMoneyClientSchema.optional(),
      }),
    )
    .default([]),
  documents: z
    .array(z.object({ documentId: z.string(), kind: z.string(), filename: z.string() }))
    .default([]),
  failure: z
    .object({
      code: z.string(),
      message: z.string(),
      retryable: z.boolean(),
      occurredAt: z.string(),
    })
    .nullable(),
  cancellation: z
    .object({
      cancelledAt: z.string(),
      reason: z.string(),
      refund: insuranceMoneyClientSchema.nullable(),
    })
    .nullable(),
  issueAttempts: z.number().int(),
  providerReference: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type InsurancePolicyRecord = z.infer<typeof insurancePolicyClientSchema>

export const bookingInsuranceClientSchema = z.object({
  bookingId: z.string(),
  applications: z.array(insuranceApplicationClientSchema).default([]),
  policies: z.array(insurancePolicyClientSchema).default([]),
})

export type BookingInsuranceRecord = z.infer<typeof bookingInsuranceClientSchema>

const envelope = <T extends z.ZodTypeAny>(schema: T) => z.object({ data: schema })

export function getBookingInsuranceQueryOptions(
  client: FetchWithValidationOptions,
  bookingId: string,
) {
  return queryOptions({
    queryKey: insuranceQueryKeys.booking(bookingId),
    queryFn: async () =>
      (
        await fetchWithValidation(
          `/insurance/bookings/${encodeURIComponent(bookingId)}`,
          envelope(bookingInsuranceClientSchema),
          client,
        )
      ).data,
  })
}

export function getInsuranceApplicationQueryOptions(
  client: FetchWithValidationOptions,
  applicationId: string,
) {
  return queryOptions({
    queryKey: insuranceQueryKeys.application(applicationId),
    queryFn: async () =>
      (
        await fetchWithValidation(
          `/insurance/applications/${encodeURIComponent(applicationId)}`,
          envelope(insuranceApplicationClientSchema),
          client,
        )
      ).data,
  })
}

export function getInsurancePolicyQueryOptions(
  client: FetchWithValidationOptions,
  policyId: string,
) {
  return queryOptions({
    queryKey: insuranceQueryKeys.policy(policyId),
    queryFn: async () =>
      (
        await fetchWithValidation(
          `/insurance/policies/${encodeURIComponent(policyId)}`,
          envelope(insurancePolicyClientSchema),
          client,
        )
      ).data,
  })
}

export async function retryInsuranceIssueRequest(
  client: FetchWithValidationOptions,
  input: { policyId: string; reason?: string },
): Promise<InsurancePolicyRecord> {
  const result = await fetchWithValidation(
    `/insurance/policies/${encodeURIComponent(input.policyId)}/retry-issue`,
    envelope(insurancePolicyClientSchema),
    client,
    { method: "POST", body: JSON.stringify(input.reason ? { reason: input.reason } : {}) },
  )
  return result.data
}

export async function cancelInsurancePolicyRequest(
  client: FetchWithValidationOptions,
  input: { policyId: string; reason: string },
): Promise<InsurancePolicyRecord> {
  const result = await fetchWithValidation(
    `/insurance/policies/${encodeURIComponent(input.policyId)}/cancel`,
    envelope(insurancePolicyClientSchema),
    client,
    { method: "POST", body: JSON.stringify({ reason: input.reason }) },
  )
  return result.data
}
