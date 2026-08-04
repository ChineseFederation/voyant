import {
  customFieldDefinitionInputSchema,
  customFieldDefinitionListQuerySchema,
  customFieldValueListQuerySchema,
  updateCustomFieldDefinitionSchema,
  upsertCustomFieldValueSchema,
} from "@voyant-travel/custom-fields"
import type {
  FinanceAppApiExternalLifecycleObservation,
  FinanceAppApiExternalReference,
  FinanceAppApiExternalSyncState,
  FinanceAppApiIssuanceDocument,
  FinanceAppApiPdfArtifact,
  FinanceAppApiSettlementObservation,
} from "@voyant-travel/finance-contracts/app-api"
import { z } from "zod"

/**
 * Re-exported so every existing importer keeps its path. The value is defined
 * in `@voyant-travel/app-manifest`, alongside the other contract versions a
 * release declares — and, unlike this package, that one is published, so a
 * publisher can read the version they are pinning to.
 */
export { APP_API_VERSION } from "@voyant-travel/app-manifest"

export const appApiVersionHeader = "voyant-app-api-version"

export const appApiEntityReadQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
})

export const appApiFinanceDocumentQuerySchema = z.object({
  invoiceId: z.string().min(1).optional(),
  provider: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
})

export const appApiFinanceActionSchema = z
  .object({
    action: z.enum(["issue", "retry", "reconcile"]),
    invoiceId: z.string().min(1).optional(),
    bookingId: z.string().min(1).optional(),
    approvalId: z.string().min(1).optional(),
    idempotencyKey: z.string().min(1),
    payload: z.record(z.string(), z.unknown()).default({}),
  })
  .strict()

export const appApiFinanceExternalReferenceSchema = z
  .object({
    externalId: z.string().min(1).max(500).nullable(),
    externalNumber: z.string().min(1).max(500).nullable(),
    externalUrl: z
      .string()
      .url()
      .max(2_048)
      .refine((value) => new URL(value).protocol === "https:", "External URL must use HTTPS.")
      .nullable(),
    status: z.string().min(1).max(100).nullable(),
    metadata: z
      .record(z.string().min(1).max(100), z.unknown())
      .refine((value) => JSON.stringify(value).length <= 16_384, "Metadata is too large.")
      .nullable(),
    syncedAt: z.string().datetime().nullable(),
    syncError: z.string().max(4_000).nullable(),
  })
  .strict()

export const appApiFinanceExternalReferenceUpsertSchema = z
  .object({
    reference: appApiFinanceExternalReferenceSchema,
    allocation: z
      .object({ invoiceNumber: z.string().trim().min(1).max(500) })
      .strict()
      .optional(),
  })
  .strict()

export const appApiFinancePdfArtifactHeadersSchema = z
  .object({
    idempotencyKey: z.string().trim().min(1).max(200),
    fileName: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .refine(
        (value) =>
          [...value].every((character) => {
            const code = character.charCodeAt(0)
            return code >= 32 && code !== 127 && character !== "/" && character !== "\\"
          }),
        "Invalid artifact file name.",
      ),
  })
  .strict()

const appApiFinanceExternalSyncErrorSchema = z
  .object({
    code: z.string().trim().min(1).max(100),
    message: z.string().trim().min(1).max(2_000),
  })
  .strict()

export const appApiFinanceExternalSyncStateSchema = z
  .object({
    operationId: z.string().trim().min(1).max(200),
    status: z.enum(["succeeded", "retryable_failure", "terminal_failure"]),
    occurredAt: z.string().datetime(),
    error: appApiFinanceExternalSyncErrorSchema.nullable().default(null),
    metadata: z
      .record(z.string().trim().min(1).max(100), z.unknown())
      .refine((value) => JSON.stringify(value).length <= 16_384, "Metadata is too large.")
      .nullable()
      .default(null),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status === "succeeded" && value.error) {
      context.addIssue({
        code: "custom",
        message: "Successful sync state cannot include an error.",
      })
    }
    if (value.status !== "succeeded" && !value.error) {
      context.addIssue({ code: "custom", message: "Failed sync state requires an error." })
    }
  })

const appApiFinanceDocumentLineageSchema = z
  .object({
    sourceDocumentId: z.string().trim().min(1).max(200),
    successorDocumentId: z.string().trim().min(1).max(200),
  })
  .strict()

export const appApiFinanceExternalLifecycleStateSchema = z.discriminatedUnion("state", [
  z
    .object({
      operationId: z.string().trim().min(1).max(200),
      state: z.literal("converted"),
      occurredAt: z.string().datetime(),
      lineage: appApiFinanceDocumentLineageSchema,
    })
    .strict(),
  z
    .object({
      operationId: z.string().trim().min(1).max(200),
      state: z.literal("voided"),
      occurredAt: z.string().datetime(),
      lineage: z.null().default(null),
    })
    .strict(),
])

export const appApiFinanceSettlementObservationSchema = z
  .object({
    operationId: z.string().trim().min(1).max(200),
    occurredAt: z.string().datetime(),
    status: z.enum(["partial", "paid"]),
    currency: z
      .string()
      .trim()
      .regex(/^[A-Z]{3}$/),
    totals: z
      .object({
        totalCents: z.number().int().nonnegative(),
        paidCents: z.number().int().positive(),
        balanceDueCents: z.number().int().nonnegative(),
      })
      .strict(),
    paymentIdentifiers: z
      .array(z.string().trim().min(1).max(200))
      .min(1)
      .max(100)
      .refine(
        (value) => new Set(value).size === value.length,
        "Payment identifiers must be unique.",
      ),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.totals.paidCents + value.totals.balanceDueCents !== value.totals.totalCents) {
      context.addIssue({ code: "custom", message: "Settlement totals must balance." })
    }
    if (value.status === "partial" && value.totals.balanceDueCents === 0) {
      context.addIssue({ code: "custom", message: "Partial settlement requires a balance." })
    }
    if (value.status === "paid" && value.totals.balanceDueCents !== 0) {
      context.addIssue({ code: "custom", message: "Paid settlement cannot have a balance." })
    }
  })

export const appApiWebhookReplaySchema = z
  .object({
    deliveryId: z.string().min(1),
  })
  .strict()

export const appApiWebhookSigningKeyConfirmSchema = z
  .object({
    keyId: z.string().trim().min(1).max(160),
    challenge: z.string().trim().min(1).max(4_096),
    proof: z.string().trim().min(32).max(512),
  })
  .strict()

export const appApiAuditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
})

export const appApiDefinitionNamespaceSchema = z
  .object({
    namespace: z.string().optional(),
  })
  .strict()

export {
  customFieldDefinitionInputSchema as appApiCustomFieldDefinitionCreateSchema,
  customFieldDefinitionListQuerySchema as appApiCustomFieldDefinitionListQuerySchema,
  customFieldValueListQuerySchema as appApiCustomFieldValueListQuerySchema,
  updateCustomFieldDefinitionSchema as appApiCustomFieldDefinitionUpdateSchema,
  upsertCustomFieldValueSchema as appApiCustomFieldValueUpsertSchema,
}

export type AppApiEntityReadQuery = z.infer<typeof appApiEntityReadQuerySchema>
export type AppApiFinanceDocumentQuery = z.infer<typeof appApiFinanceDocumentQuerySchema>
export type AppApiFinanceActionInput = z.infer<typeof appApiFinanceActionSchema>
export type AppApiWebhookSigningKeyConfirmInput = z.infer<
  typeof appApiWebhookSigningKeyConfirmSchema
>
export type AppApiFinanceExternalReferenceUpsertInput = z.infer<
  typeof appApiFinanceExternalReferenceUpsertSchema
>
export type AppApiFinancePdfArtifactHeaders = z.infer<typeof appApiFinancePdfArtifactHeadersSchema>
export type AppApiFinanceExternalSyncStateInput = z.infer<
  typeof appApiFinanceExternalSyncStateSchema
>
export type AppApiFinanceExternalLifecycleStateInput = z.infer<
  typeof appApiFinanceExternalLifecycleStateSchema
>
export type AppApiFinanceSettlementObservationInput = z.infer<
  typeof appApiFinanceSettlementObservationSchema
>
export type AppApiWebhookReplayInput = z.infer<typeof appApiWebhookReplaySchema>
export type AppApiAuditQuery = z.infer<typeof appApiAuditQuerySchema>

export type AppApiFinanceIssuanceDocument = FinanceAppApiIssuanceDocument
export type AppApiFinanceExternalReference = FinanceAppApiExternalReference
export type AppApiFinancePdfArtifact = FinanceAppApiPdfArtifact & { documentUrl: string }
export type AppApiFinanceExternalSyncState = FinanceAppApiExternalSyncState
export type AppApiFinanceExternalLifecycleObservation = FinanceAppApiExternalLifecycleObservation
export type AppApiFinanceSettlementObservation = FinanceAppApiSettlementObservation
