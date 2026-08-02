import { z } from "zod"

export const bookingActionKindSchema = z.enum([
  "hold_expiry",
  "deposit_due",
  "balance_due",
  "installment_due",
  "supplier_response_due",
  "supplier_reconciliation_due",
  "legal_acceptance_due",
  "legal_signature_due",
])
export type BookingActionKind = z.infer<typeof bookingActionKindSchema>

export const bookingActionSourceStateSchema = z.enum([
  "open",
  "satisfied",
  "cancelled",
  "superseded",
  "invalid_source",
])
export type BookingActionSourceState = z.infer<typeof bookingActionSourceStateSchema>

export const bookingActionStateSchema = z.enum([
  "scheduled",
  "due",
  "overdue",
  "escalated",
  "satisfied",
  "cancelled",
  "superseded",
  "invalid_source",
])
export type BookingActionState = z.infer<typeof bookingActionStateSchema>

export const bookingActionOperatorNextActionSchema = z.enum([
  "monitor_hold",
  "collect_payment",
  "contact_customer",
  "reconcile_supplier_operation",
  "review_supplier_operation",
  "obtain_legal_acceptance",
  "obtain_signature",
  "none",
])
export type BookingActionOperatorNextAction = z.infer<typeof bookingActionOperatorNextActionSchema>

export const bookingActionCustomerNextActionSchema = z.enum([
  "complete_booking",
  "make_payment",
  "await_supplier_confirmation",
  "accept_terms",
  "sign_contract",
  "none",
])
export type BookingActionCustomerNextAction = z.infer<typeof bookingActionCustomerNextActionSchema>

export const bookingActionDeadlineSchema = z.discriminatedUnion("semantics", [
  z.object({
    semantics: z.literal("instant"),
    at: z.string().datetime(),
    timeZone: z.literal("UTC"),
  }),
  z.object({
    semantics: z.literal("local_date_end"),
    localDate: z.string().date(),
    timeZone: z.string().trim().min(1).max(100),
  }),
])
export type BookingActionDeadline = z.infer<typeof bookingActionDeadlineSchema>

export const bookingActionEscalationPolicySchema = z
  .object({
    dueWindowSeconds: z
      .number()
      .int()
      .nonnegative()
      .default(24 * 60 * 60),
    escalateAfterSeconds: z
      .number()
      .int()
      .nonnegative()
      .default(72 * 60 * 60),
  })
  .refine((value) => value.escalateAfterSeconds >= value.dueWindowSeconds, {
    message: "escalateAfterSeconds must be greater than or equal to dueWindowSeconds",
    path: ["escalateAfterSeconds"],
  })
export type BookingActionEscalationPolicy = z.infer<typeof bookingActionEscalationPolicySchema>

/**
 * One current obligation as read from its authoritative module.
 *
 * Projection consumers never manufacture these records from browser input.
 * Source providers reread their own tables and supply a complete current
 * snapshot; delayed triggers therefore converge on current authority instead
 * of replaying stale event payloads.
 */
export const bookingActionSourceSnapshotSchema = z.object({
  sourceModule: z.string().trim().min(1).max(100),
  sourceType: z.string().trim().min(1).max(100),
  sourceId: z.string().trim().min(1).max(255),
  sourceUpdatedAt: z.string().datetime(),
  kind: bookingActionKindSchema,
  bookingId: z.string().trim().min(1).nullable(),
  bookingSessionId: z.string().trim().min(1).nullable(),
  deadline: bookingActionDeadlineSchema,
  sourceState: bookingActionSourceStateSchema.exclude(["invalid_source"]),
  satisfiedAt: z.string().datetime().nullable(),
  escalationPolicy: bookingActionEscalationPolicySchema,
  operatorNextAction: bookingActionOperatorNextActionSchema,
  customerVisible: z.boolean(),
  customerNextAction: bookingActionCustomerNextActionSchema.nullable(),
  safeMetadata: z.record(z.string(), z.unknown()).default({}),
})
export type BookingActionSourceSnapshot = z.infer<typeof bookingActionSourceSnapshotSchema>

export const bookingActionRecordSchema = z.object({
  id: z.string(),
  providerId: z.string(),
  sourceModule: z.string(),
  sourceType: z.string(),
  sourceId: z.string(),
  sourceUpdatedAt: z.string().datetime(),
  kind: bookingActionKindSchema,
  bookingId: z.string().nullable(),
  bookingSessionId: z.string().nullable(),
  dueAt: z.string().datetime(),
  dueLocalDate: z.string().date().nullable(),
  timeZone: z.string(),
  deadlineSemantics: z.enum(["instant", "local_date_end"]),
  state: bookingActionStateSchema,
  satisfiedAt: z.string().datetime().nullable(),
  escalationPolicy: bookingActionEscalationPolicySchema,
  operatorNextAction: bookingActionOperatorNextActionSchema,
  customerVisible: z.boolean(),
  customerNextAction: bookingActionCustomerNextActionSchema.nullable(),
  safeMetadata: z.record(z.string(), z.unknown()),
  projectedAt: z.string().datetime(),
})
export type BookingActionRecord = z.infer<typeof bookingActionRecordSchema>

/** Public shape deliberately omits provider/source identities and metadata. */
export const publicBookingActionRecordSchema = bookingActionRecordSchema.pick({
  id: true,
  kind: true,
  bookingId: true,
  dueAt: true,
  dueLocalDate: true,
  timeZone: true,
  deadlineSemantics: true,
  state: true,
  satisfiedAt: true,
  customerNextAction: true,
})
export type PublicBookingActionRecord = z.infer<typeof publicBookingActionRecordSchema>

export const bookingActionListQuerySchema = z.object({
  bookingId: z.string().trim().min(1).optional(),
  bookingSessionId: z.string().trim().min(1).optional(),
  kind: bookingActionKindSchema.optional(),
  state: bookingActionStateSchema.optional(),
  dueFrom: z.string().datetime().optional(),
  dueTo: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})
export type BookingActionListQuery = z.input<typeof bookingActionListQuerySchema>

export const bookingActionListResponseSchema = z.object({
  data: z.array(bookingActionRecordSchema),
  count: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  asOf: z.string().datetime(),
})

export const publicBookingActionListResponseSchema = z.object({
  data: z.array(publicBookingActionRecordSchema),
  asOf: z.string().datetime(),
})

export const bookingActionSyncModeSchema = z.enum(["incremental", "rebuild"])
export type BookingActionSyncMode = z.infer<typeof bookingActionSyncModeSchema>

export const bookingActionSyncSummarySchema = z.object({
  mode: bookingActionSyncModeSchema,
  providers: z.number().int().nonnegative(),
  projected: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
  invalidated: z.number().int().nonnegative(),
})
export type BookingActionSyncSummary = z.infer<typeof bookingActionSyncSummarySchema>
