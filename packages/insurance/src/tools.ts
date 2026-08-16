/**
 * Insurance Tools.
 *
 * Four, and the split between them is the same split the routes make: reading
 * what was sold, and the two acts that exist because a traveller can pay and
 * end up with no policy.
 *
 * What is deliberately absent is a tool that quotes or buys. Selling insurance
 * carries pre-contractual duties — the product information document has to be
 * reachable before purchase, the insurer's terms have to be the version in
 * force, the customer's demands and needs have to be stated — and none of those
 * are dischargeable by an agent making a tool call. Quoting and buying stay on
 * the checkout step where a person sees the disclosures.
 *
 * `get_booking_insurance` returns no identity data at all. An agent
 * reconciling premiums does not need a passport number, and a tool result is
 * exactly the kind of thing that ends up in a transcript.
 */

import {
  defineTool,
  READ_ONLY_RISK,
  requireService,
  type ToolContext,
  ToolError,
} from "@voyant-travel/tools"
import { z } from "zod"

import {
  insuranceApplicationStatusWireSchema,
  insurancePolicyIssueStateWireSchema,
} from "./validation.js"

const OWNER = "@voyant-travel/insurance"
const VERSION = "v1"
const STAFF_AUDIENCE = { source: "grant", allowed: ["staff"] } as const
const READ_SCOPES = ["insurance:read"] as const
const WRITE_SCOPES = ["insurance:write"] as const
const WRITE_RISK = {
  destructive: false,
  reversible: true,
  dryRunSupported: false,
  confirmationRequired: false,
  sideEffects: ["data-write"],
} as const

const moneyToolSchema = z.object({
  amountMinor: z.number().int(),
  currency: z.string(),
})

/**
 * The application as a Tool sees it: commercial facts, no people.
 *
 * `insuredPersonCount` rather than a list, on purpose. It answers the only
 * question an operator agent actually has ("does the policy cover everyone we
 * charged for?") without the answer carrying anybody's name.
 */
export const insuranceApplicationToolSchema = z.object({
  id: z.string(),
  bookingId: z.string().nullable(),
  providerId: z.string(),
  status: insuranceApplicationStatusWireSchema,
  title: z.string(),
  planLabel: z.string().nullable(),
  premium: moneyToolSchema,
  expiresAt: z.string(),
  eligibilityStatus: z.string(),
  insuredPersonCount: z.number().int().nonnegative(),
  createdAt: z.string(),
})

export const insurancePolicyToolSchema = z.object({
  id: z.string(),
  applicationId: z.string(),
  bookingId: z.string().nullable(),
  providerId: z.string(),
  policyNumber: z.string().nullable(),
  issueState: insurancePolicyIssueStateWireSchema,
  issuedAt: z.string().nullable(),
  effectiveFrom: z.string(),
  effectiveTo: z.string(),
  premium: moneyToolSchema,
  issueAttempts: z.number().int(),
  failure: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }).nullable(),
})

export const getBookingInsuranceToolInputSchema = z.object({
  bookingId: z.string().min(1).describe("The booking id (book_…) to read insurance for."),
})

export const getBookingInsuranceToolOutputSchema = z.object({
  bookingId: z.string(),
  applications: z.array(insuranceApplicationToolSchema),
  policies: z.array(insurancePolicyToolSchema),
})

export const getInsurancePolicyToolInputSchema = z.object({
  policyId: z.string().min(1).describe("The policy id (inpo_…)."),
})

export const getInsurancePolicyToolOutputSchema = z.object({
  policy: insurancePolicyToolSchema,
})

export const retryInsuranceIssueToolInputSchema = z.object({
  policyId: z.string().min(1).describe("The policy whose issue attempt failed (inpo_…)."),
  reason: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .optional()
    .describe("Why the retry is being made. Recorded on the booking's activity log."),
})

export const retryInsuranceIssueToolOutputSchema = z.object({
  status: z.enum(["issued", "failed"]),
  policy: insurancePolicyToolSchema,
})

export const cancelInsurancePolicyToolInputSchema = z.object({
  policyId: z.string().min(1).describe("The issued policy to cancel (inpo_…)."),
  reason: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .describe("Why the policy is being cancelled. Sent to the insurer and recorded."),
})

export const cancelInsurancePolicyToolOutputSchema = z.object({
  status: z.literal("cancelled"),
  policy: insurancePolicyToolSchema,
})

export interface InsuranceToolServices {
  getBookingInsurance(
    input: z.infer<typeof getBookingInsuranceToolInputSchema>,
  ): Promise<z.infer<typeof getBookingInsuranceToolOutputSchema> | null>
  getPolicy(
    input: z.infer<typeof getInsurancePolicyToolInputSchema>,
  ): Promise<z.infer<typeof insurancePolicyToolSchema> | null>
  retryIssue(
    input: z.infer<typeof retryInsuranceIssueToolInputSchema>,
  ): Promise<z.infer<typeof retryInsuranceIssueToolOutputSchema> | null>
  cancelPolicy(
    input: z.infer<typeof cancelInsurancePolicyToolInputSchema>,
  ): Promise<z.infer<typeof cancelInsurancePolicyToolOutputSchema> | { error: string } | null>
}

export type InsuranceToolContext = ToolContext & { insurance?: InsuranceToolServices }

function insurance(ctx: InsuranceToolContext): InsuranceToolServices {
  return requireService(ctx.insurance, "insurance")
}

export const getBookingInsuranceTool = defineTool({
  owner: OWNER,
  capabilityId: `${OWNER}#tool.get-booking-insurance`,
  capabilityVersion: VERSION,
  name: "get_booking_insurance",
  description:
    "Read the travel insurance attached to one booking: the applications opened with each insurer and the policies that were issued, failed, or cancelled. Returns commercial facts only — premiums, plan labels, policy numbers and issue state — and never an insured person's name, date of birth or document number.",
  inputSchema: getBookingInsuranceToolInputSchema,
  outputSchema: getBookingInsuranceToolOutputSchema,
  requiredScopes: READ_SCOPES,
  audience: STAFF_AUDIENCE,
  tier: "read",
  riskPolicy: READ_ONLY_RISK,
  annotations: { readOnlyHint: true, idempotentHint: true },
  async handler(input, ctx: InsuranceToolContext) {
    const result = await insurance(ctx).getBookingInsurance(input)
    if (!result) {
      throw new ToolError(`Booking "${input.bookingId}" was not found.`, "NOT_FOUND", {
        bookingId: input.bookingId,
      })
    }
    return getBookingInsuranceToolOutputSchema.parse(result)
  },
})

export const getInsurancePolicyTool = defineTool({
  owner: OWNER,
  capabilityId: `${OWNER}#tool.get-insurance-policy`,
  capabilityVersion: VERSION,
  name: "get_insurance_policy",
  description:
    "Read one travel insurance policy by id: its issue state, the insurer's policy number, the window it covers, the premium charged, and — when issuing failed — the reason and whether a retry could succeed.",
  inputSchema: getInsurancePolicyToolInputSchema,
  outputSchema: getInsurancePolicyToolOutputSchema,
  requiredScopes: READ_SCOPES,
  audience: STAFF_AUDIENCE,
  tier: "read",
  riskPolicy: READ_ONLY_RISK,
  annotations: { readOnlyHint: true, idempotentHint: true },
  async handler(input, ctx: InsuranceToolContext) {
    const policy = await insurance(ctx).getPolicy(input)
    if (!policy) {
      throw new ToolError(`Policy "${input.policyId}" was not found.`, "NOT_FOUND", {
        policyId: input.policyId,
      })
    }
    return getInsurancePolicyToolOutputSchema.parse({ policy })
  },
})

export const retryInsuranceIssueTool = defineTool({
  owner: OWNER,
  capabilityId: `${OWNER}#tool.retry-insurance-issue`,
  capabilityVersion: VERSION,
  name: "retry_insurance_issue",
  description:
    "Ask the insurer again to issue a policy whose first attempt failed. Sends the application the insurer already holds — nothing is re-collected and no price is re-quoted — under an idempotency key derived from the attempt count, so an insurer that already issued replays rather than issuing a second policy. Only applies to a policy in `pending` or `issue_failed`; an issued or cancelled policy is refused.",
  inputSchema: retryInsuranceIssueToolInputSchema,
  outputSchema: retryInsuranceIssueToolOutputSchema,
  requiredScopes: WRITE_SCOPES,
  audience: STAFF_AUDIENCE,
  tier: "write",
  riskPolicy: WRITE_RISK,
  async handler(input, ctx: InsuranceToolContext) {
    const result = await insurance(ctx).retryIssue(input)
    if (!result) {
      throw new ToolError(`Policy "${input.policyId}" was not found.`, "NOT_FOUND", {
        policyId: input.policyId,
      })
    }
    return retryInsuranceIssueToolOutputSchema.parse(result)
  },
})

export const cancelInsurancePolicyTool = defineTool({
  owner: OWNER,
  capabilityId: `${OWNER}#tool.cancel-insurance-policy`,
  capabilityVersion: VERSION,
  name: "cancel_insurance_policy",
  description:
    "Cancel an issued travel insurance policy at the insurer and record what the insurer returned, including any refund. The insurer is asked first: if it refuses or cannot be reached, nothing changes locally, so the operator never sees a cancelled policy that is still live upstream.",
  inputSchema: cancelInsurancePolicyToolInputSchema,
  outputSchema: cancelInsurancePolicyToolOutputSchema,
  requiredScopes: WRITE_SCOPES,
  audience: STAFF_AUDIENCE,
  tier: "write",
  riskPolicy: {
    ...WRITE_RISK,
    // Reinstating a cancelled policy is the insurer's decision, not ours.
    reversible: false,
    sideEffects: ["data-write", "external-booking"],
  },
  async handler(input, ctx: InsuranceToolContext) {
    const result = await insurance(ctx).cancelPolicy(input)
    if (!result) {
      throw new ToolError(`Policy "${input.policyId}" was not found.`, "NOT_FOUND", {
        policyId: input.policyId,
      })
    }
    if ("error" in result) {
      // `PROVIDER_ERROR`, not `PROVIDER_UNAVAILABLE`: the insurer answered and
      // refused. `PROVIDER_UNAVAILABLE` is the retryable code, and retrying a
      // cancellation the insurer has already declined achieves nothing.
      throw new ToolError(
        `The insurer did not cancel policy "${input.policyId}": ${result.error}`,
        "PROVIDER_ERROR",
        { policyId: input.policyId },
      )
    }
    return cancelInsurancePolicyToolOutputSchema.parse(result)
  },
})

export const insuranceTools = [
  getBookingInsuranceTool,
  getInsurancePolicyTool,
  retryInsuranceIssueTool,
  cancelInsurancePolicyTool,
] as const
