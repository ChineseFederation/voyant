import { z } from "zod"

import {
  tripComponentKindSchema,
  tripComponentPricingSnapshotSchema,
  tripComponentStatusSchema,
  tripComponentTaxLineSchema,
  tripEnvelopePricingSnapshotSchema,
  tripEnvelopeStatusSchema,
} from "./validation.js"

const isoTimestamp = z.string()
const jsonObject = z.record(z.string(), z.unknown())

export const tripEnvelopeToolSchema = z.object({
  id: z.string(),
  status: tripEnvelopeStatusSchema,
  title: z.string().nullable(),
  description: z.string().nullable(),
  travelerParty: jsonObject,
  constraints: jsonObject,
  aggregateCurrency: z.string().nullable(),
  aggregateSubtotalAmountCents: z.number().int().nullable(),
  aggregateTaxAmountCents: z.number().int().nullable(),
  aggregateTotalAmountCents: z.number().int().nullable(),
  aggregatePricingSnapshot: tripEnvelopePricingSnapshotSchema.nullable(),
  currentPriceExpiresAt: isoTimestamp.nullable(),
  bookingGroupId: z.string().nullable(),
  orderId: z.string().nullable(),
  paymentSessionId: z.string().nullable(),
  reserveIdempotencyKey: z.string().nullable(),
  reserveStartedAt: isoTimestamp.nullable(),
  reservedAt: isoTimestamp.nullable(),
  checkoutIdempotencyKey: z.string().nullable(),
  checkoutStartedAt: isoTimestamp.nullable(),
  createdBy: z.string().nullable(),
  updatedBy: z.string().nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

export const tripComponentToolSchema = z.object({
  id: z.string(),
  envelopeId: z.string(),
  sequence: z.number().int(),
  kind: tripComponentKindSchema,
  status: tripComponentStatusSchema,
  title: z.string().nullable(),
  description: z.string().nullable(),
  entityModule: z.string().nullable(),
  entityId: z.string().nullable(),
  sourceKind: z.string().nullable(),
  sourceConnectionId: z.string().nullable(),
  sourceRef: z.string().nullable(),
  bookingDraftId: z.string().nullable(),
  catalogQuoteId: z.string().nullable(),
  bookingId: z.string().nullable(),
  bookingGroupId: z.string().nullable(),
  orderId: z.string().nullable(),
  paymentSessionId: z.string().nullable(),
  providerRef: z.string().nullable(),
  supplierRef: z.string().nullable(),
  componentCurrency: z.string().nullable(),
  componentSubtotalAmountCents: z.number().int().nullable(),
  componentTaxAmountCents: z.number().int().nullable(),
  componentTotalAmountCents: z.number().int().nullable(),
  pricingSnapshot: tripComponentPricingSnapshotSchema.nullable(),
  taxLines: z.array(tripComponentTaxLineSchema).nullable(),
  cancellationSnapshot: z
    .object({
      action: z.string(),
      refundAmountCents: z.number().int(),
      refundCurrency: z.string().nullable(),
      penaltyAmountCents: z.number().int(),
      supplierCancellationDeadline: z.string().nullable(),
      policySummary: z.string().nullable(),
      snapshot: jsonObject.nullable(),
    })
    .nullable(),
  holdToken: z.string().nullable(),
  holdExpiresAt: isoTimestamp.nullable(),
  priceExpiresAt: isoTimestamp.nullable(),
  warningCodes: z.array(z.string()),
  metadata: jsonObject,
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

export const tripRequirementToolSchema = z.object({
  id: z.string(),
  envelopeId: z.string(),
  sequence: z.number().int(),
  status: z.enum([
    "open",
    "sourcing",
    "candidates_ready",
    "selected",
    "no_availability",
    "cancelled",
  ]),
  title: z.string().nullable(),
  description: z.string().nullable(),
  vertical: z.string(),
  criteria: jsonObject,
  criteriaVersion: z.string(),
  required: z.boolean(),
  selectedCandidateId: z.string().nullable(),
  resolvedComponentId: z.string().nullable(),
  lastSourcedAt: isoTimestamp.nullable(),
  metadata: jsonObject,
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

/** Provider replay/economics data is deliberately omitted from the agent-visible shape. */
export const tripCandidateToolSchema = z.object({
  id: z.string(),
  requirementId: z.string(),
  envelopeId: z.string(),
  rank: z.number().int(),
  status: z.enum(["ranked", "selected", "expired", "discarded"]),
  candidateRef: z.string(),
  entityModule: z.string(),
  entityId: z.string(),
  sourceKind: z.string(),
  sourceConnectionId: z.string().nullable(),
  sourceModule: z.string().nullable(),
  selection: jsonObject,
  priceCurrency: z.string(),
  priceAmount: z.string(),
  expiresAt: isoTimestamp.nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

/** Immutable admission result for the durable requirement-sourcing worker. */
export const sourceTripCandidatesAcceptedResultSchema = z.object({
  status: z.literal("accepted"),
  operationId: z.string().min(1),
  requirementId: z.string().min(1),
  statusTool: z.literal("get_trip_requirement_sourcing_operation"),
})

export const tripRequirementSourcingOperationResultSchema = z.object({
  operationId: z.string().min(1),
  requirementId: z.string().min(1),
  status: z.enum(["pending", "processing", "retry", "completed", "dead_letter"]),
  result: sourceTripCandidatesAcceptedResultSchema,
  outcome: z
    .discriminatedUnion("status", [
      z.object({
        status: z.literal("completed"),
        candidateCount: z.number().int().nonnegative(),
        requirementStatus: z.enum(["candidates_ready", "no_availability"]),
      }),
      z.object({
        status: z.literal("dead_letter"),
        error: z.string(),
      }),
    ])
    .nullable(),
  error: z.string().nullable(),
  attempts: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  nextAttemptAt: isoTimestamp,
  completedAt: isoTimestamp.nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

export const tripActionAcceptedResultSchema = z.object({
  status: z.literal("accepted"),
  operationId: z.string().min(1),
  action: z.enum(["price-trip", "reserve-trip"]),
  envelopeId: z.string().min(1),
  statusTool: z.literal("get_trip_action_operation"),
})

export const tripActionOperationResultSchema = z.object({
  operationId: z.string().min(1),
  action: z.enum(["price-trip", "reserve-trip"]),
  envelopeId: z.string().min(1),
  status: z.enum(["pending", "processing", "retry", "completed", "dead_letter"]),
  result: tripActionAcceptedResultSchema,
  outcome: z
    .discriminatedUnion("status", [
      z.object({
        status: z.literal("completed"),
        backendIdentity: z.string().min(1),
        providerOperationId: z.string().min(1),
        result: jsonObject,
      }),
      z.object({ status: z.literal("dead_letter"), error: z.string() }),
    ])
    .nullable(),
  error: z.string().nullable(),
  attempts: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  nextAttemptAt: isoTimestamp,
  completedAt: isoTimestamp.nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

export const selectTripCandidateResultSchema = z.object({
  requirement: tripRequirementToolSchema,
  candidate: tripCandidateToolSchema,
  component: tripComponentToolSchema,
})

export const createTripResultSchema = z.object({
  envelope: tripEnvelopeToolSchema,
  components: z.array(tripComponentToolSchema),
})

export const reviseTripResultSchema = z.object({
  envelopeId: z.string(),
  added: z.array(tripComponentToolSchema),
  removed: z.array(tripComponentToolSchema),
})

export const priceTripResultSchema = createTripResultSchema.extend({
  pricing: z.object({
    currency: z.string(),
    subtotalAmountCents: z.number().int(),
    taxAmountCents: z.number().int(),
    totalAmountCents: z.number().int(),
    componentCount: z.number().int().nonnegative(),
    pricedComponentCount: z.number().int().nonnegative(),
    warnings: z.array(z.string()).optional(),
  }),
  warnings: z.array(z.string()),
  failures: z.array(z.object({ componentId: z.string(), reason: z.string() })),
})

const reservationFailureSchema = z.object({
  componentId: z.string(),
  reason: z.string(),
  code: z.string().optional(),
  details: jsonObject.optional(),
})

export const reserveTripResultSchema = createTripResultSchema.extend({
  reservationPlanId: z.string().nullable().optional(),
  reserved: z.array(
    z.object({
      componentId: z.string(),
      status: z.enum(["held", "booked"]),
    }),
  ),
  failures: z.array(reservationFailureSchema),
  compensations: z.array(
    z.object({
      componentId: z.string(),
      status: z.enum(["released", "release_failed", "release_not_configured"]),
      reason: z.string().optional(),
    }),
  ),
  warnings: z.array(z.string()),
})
