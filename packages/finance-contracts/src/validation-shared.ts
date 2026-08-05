import { z } from "zod"

/**
 * The processor checkout handoff, mirroring `PaymentHostedCheckout` from
 * `@voyant-travel/payments`.
 *
 * It is mirrored rather than imported because contracts packages depend only on
 * zod — they describe the wire, they do not pull in runtime packages. The
 * mirror is pinned to the port by an annotated projection in
 * `@voyant-travel/finance`'s public service, so a drifted arm fails the build
 * rather than silently serving a shape the port no longer produces.
 */
export const paymentRedirectCheckoutSchema = z.object({
  kind: z.enum(["hosted_checkout", "redirect"]),
  url: z.string(),
  expiresAt: z.string().nullable().optional(),
})

/**
 * The in-page arm. `clientSecret` and `publishableKey` are opaque here on
 * purpose: the runtime forwards them and never parses them, so no provider's
 * token format is baked into the contract.
 */
export const paymentEmbeddedCheckoutSchema = z.object({
  kind: z.literal("embedded"),
  clientSecret: z.string(),
  publishableKey: z.string(),
  providerAccountId: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
})

export const paymentCheckoutSchema = z.discriminatedUnion("kind", [
  paymentRedirectCheckoutSchema,
  paymentEmbeddedCheckoutSchema,
])

export type PaymentCheckoutContract = z.infer<typeof paymentCheckoutSchema>

export const ianaTimeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .describe("IANA timezone for the local business date, for example Europe/Bucharest.")
  .refine(
    (value) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: value }).format()
        return true
      } catch {
        return false
      }
    },
    { message: "Expected a valid IANA timezone" },
  )

export const invoiceStatusSchema = z.enum([
  "draft",
  "pending_external_allocation",
  "issued",
  "partially_paid",
  "paid",
  "overdue",
  "void",
])
export const paymentMethodSchema = z.enum([
  "bank_transfer",
  "credit_card",
  "debit_card",
  "cash",
  "cheque",
  "wallet",
  "direct_bill",
  "travel_credit",
  "other",
])
export const paymentStatusSchema = z.enum(["pending", "completed", "failed", "refunded"])
export const paymentSessionStatusSchema = z.enum([
  "pending",
  "requires_redirect",
  "processing",
  "authorized",
  "paid",
  "failed",
  "cancelled",
  "expired",
])
export const paymentSessionTargetTypeSchema = z.enum([
  "booking_session",
  "booking",
  "order",
  "invoice",
  "booking_payment_schedule",
  "booking_guarantee",
  "flight_order",
  "other",
])
export const paymentInstrumentTypeSchema = z.enum([
  "credit_card",
  "debit_card",
  "bank_account",
  "wallet",
  "travel_credit",
  "direct_bill",
  "cash",
  "other",
])
export const paymentInstrumentOwnerTypeSchema = z.enum([
  "client",
  "supplier",
  "channel",
  "agency",
  "internal",
  "other",
])
export const paymentInstrumentStatusSchema = z.enum([
  "active",
  "inactive",
  "expired",
  "revoked",
  "failed_verification",
])
export const paymentAuthorizationStatusSchema = z.enum([
  "pending",
  "authorized",
  "partially_captured",
  "captured",
  "voided",
  "failed",
  "expired",
])
export const paymentCaptureStatusSchema = z.enum([
  "pending",
  "completed",
  "failed",
  "refunded",
  "voided",
])
export const captureModeSchema = z.enum(["automatic", "manual"])
export const creditNoteStatusSchema = z.enum(["draft", "issued", "applied"])
export const paymentScheduleTypeSchema = z.enum([
  "deposit",
  "installment",
  "balance",
  "hold",
  "other",
])
export const paymentScheduleStatusSchema = z.enum([
  "pending",
  "due",
  "paid",
  "waived",
  "cancelled",
  "expired",
])
export const guaranteeTypeSchema = z.enum([
  "deposit",
  "credit_card",
  "preauth",
  "card_on_file",
  "bank_transfer",
  "voucher",
  "agency_letter",
  "other",
])
export const guaranteeStatusSchema = z.enum([
  "pending",
  "active",
  "released",
  "failed",
  "cancelled",
  "expired",
])
export const taxScopeSchema = z.enum(["included", "excluded", "withheld"])
export const commissionRecipientTypeSchema = z.enum([
  "channel",
  "affiliate",
  "agency",
  "agent",
  "internal",
  "supplier",
  "other",
])
export const commissionModelSchema = z.enum(["percentage", "fixed", "markup", "net"])
export const commissionStatusSchema = z.enum(["pending", "accrued", "payable", "paid", "void"])

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export const travelCreditStatusSchema = z.enum(["active", "redeemed", "expired", "void"])
export const travelCreditSourceTypeSchema = z.enum([
  "refund",
  "cancellation_credit",
  "gift",
  "manual",
  "goodwill",
  "promotion",
])

export const financeAggregatesQuerySchema = z.object({
  range: z
    .enum(["this_month", "last_month", "year_to_date", "all_time", "custom"])
    .default("all_time"),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  currency: z
    .preprocess(
      (value) =>
        typeof value === "string"
          ? value
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean)
          : value,
      z.array(z.string().trim().min(1)).optional(),
    )
    .optional(),
  invoiceType: z
    .preprocess(
      (value) =>
        typeof value === "string"
          ? value
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean)
          : value,
      z.array(z.enum(["invoice", "proforma"])).optional(),
    )
    .optional(),
  status: z
    .preprocess(
      (value) =>
        typeof value === "string"
          ? value
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean)
          : value,
      z.array(invoiceStatusSchema).optional(),
    )
    .optional(),
  /**
   * Cap on the top-N outstanding-invoice rows returned alongside the
   * outstanding-by-currency aggregate. The dashboard surfaces 5 rows
   * in its "needs collection" panel; allow up to 20 so adjacent
   * digests can reuse the endpoint.
   */
  outstandingTopLimit: z.coerce.number().int().min(0).max(20).default(5),
})
