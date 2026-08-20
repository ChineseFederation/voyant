import { z } from "zod"

export const bookingCustomerAccessBuyerAccountKindSchema = z.enum(["personal", "business"])

const staffReasonSchema = z.string().trim().min(1).max(500)

export const staffGrantBookingCustomerAccessSchema = z
  .object({
    buyerAccountId: z.string().trim().min(3).max(255),
    buyerAccountKind: bookingCustomerAccessBuyerAccountKindSchema,
    reason: staffReasonSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.buyerAccountId.startsWith(`${value.buyerAccountKind}:`)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["buyerAccountId"],
        message: "Buyer Account id must be qualified by buyerAccountKind",
      })
    }
  })

export const staffRevokeBookingCustomerAccessSchema = z
  .object({
    reason: staffReasonSchema,
  })
  .strict()

export const bookingCustomerAccessGrantResponseSchema = z.object({
  id: z.string(),
  bookingId: z.string(),
  buyerAccountId: z.string(),
  buyerAccountKind: bookingCustomerAccessBuyerAccountKindSchema,
  role: z.literal("owner"),
  source: z.enum([
    "authenticated_commit",
    "verified_booking_claim",
    "staff_grant",
    "legacy_session_backfill",
  ]),
  proofRef: z.string().nullable(),
  grantedByPrincipalId: z.string().nullable(),
  grantedByMembershipId: z.string().nullable(),
  grantedByMembershipRole: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  revokedAt: z.string().datetime().nullable(),
  revokedByPrincipalId: z.string().nullable(),
  revocationReason: z.string().nullable(),
})

export type StaffGrantBookingCustomerAccessInput = z.infer<
  typeof staffGrantBookingCustomerAccessSchema
>
export type StaffRevokeBookingCustomerAccessInput = z.infer<
  typeof staffRevokeBookingCustomerAccessSchema
>
