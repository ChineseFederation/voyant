import { z } from "zod"

export const supplierOperationStateV1 = z.enum([
  "queued",
  "submitted",
  "pending",
  "succeeded",
  "refused",
  "cancelled",
  "in_doubt",
  "manual_review",
  "manually_resolved",
])
export type SupplierOperationStateV1 = z.infer<typeof supplierOperationStateV1>

export const supplierCommitmentPolicyV1 = z.enum(["supplier_first", "operator_backed"])
export type SupplierCommitmentPolicyV1 = z.infer<typeof supplierCommitmentPolicyV1>

export const supplierOperationRecordV1 = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  quoteId: z.string().min(1),
  holdId: z.string().min(1).nullable(),
  operationKind: z.literal("reserve"),
  state: supplierOperationStateV1,
  commitmentPolicy: supplierCommitmentPolicyV1,
  entityModule: z.string().min(1),
  entityId: z.string().min(1),
  sourceKind: z.string().min(1),
  sourceConnectionId: z.string().min(1),
  sourceRef: z.string().min(1),
  adapterKind: z.string().min(1),
  requestFingerprint: z.string().min(1),
  adapterIdempotencyKey: z.string().min(8),
  attemptCount: z.number().int().nonnegative(),
  upstreamRef: z.string().min(1).nullable(),
  upstreamStatus: z.string().min(1).nullable(),
  bookingId: z.string().min(1).nullable(),
  lastErrorClass: z.string().min(1).nullable(),
  safeEvidence: z.record(z.string(), z.unknown()),
  submittedAt: z.string().datetime().nullable(),
  lastCheckedAt: z.string().datetime().nullable(),
  sourceUpdatedAt: z.string().datetime().nullable(),
  nextReconcileAt: z.string().datetime().nullable(),
  resolvedAt: z.string().datetime().nullable(),
  resolvedBy: z.string().min(1).nullable(),
  resolutionReason: z.string().min(1).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type SupplierOperationRecordV1 = z.infer<typeof supplierOperationRecordV1>

export const listSupplierOperationsQueryV1 = z.object({
  state: supplierOperationStateV1.optional(),
  sessionId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})
export type ListSupplierOperationsQueryV1 = z.input<typeof listSupplierOperationsQueryV1>

export const reconcileSupplierOperationV1 = z.object({
  idempotencyKey: z.string().min(8).max(128),
})
export type ReconcileSupplierOperationV1 = z.input<typeof reconcileSupplierOperationV1>

export const resolveSupplierOperationV1 = z.object({
  idempotencyKey: z.string().min(8).max(128),
  resolution: z.enum(["succeeded", "refused", "cancelled"]),
  reason: z.string().trim().min(1).max(2000),
  upstreamRef: z.string().trim().min(1).optional(),
})
export type ResolveSupplierOperationV1 = z.input<typeof resolveSupplierOperationV1>
