/** Booking-engine request and response V1 schemas. */

import { z } from "zod"

import { pricingBreakdownV1 } from "./pricing-contracts.js"
import { bookingRequirementsV1 } from "./requirements-contracts.js"
import { bookingSelectionV1 } from "./selection-contracts.js"

// ─────────────────────────────────────────────────────────────────
// Engine request / response contracts
// ─────────────────────────────────────────────────────────────────

export const quoteScopeV1 = z.object({
  locale: z.string(),
  audience: z.enum(["staff", "customer", "partner", "supplier"]),
  market: z.string(),
  currency: z.string().optional(),
})

export const quoteRequestV1 = z.object({
  entityModule: z.string(),
  entityId: z.string(),
  sourceKind: z.string(),
  sourceConnectionId: z.string().optional(),
  sourceRef: z.string().optional(),
  scope: quoteScopeV1,
  draft: bookingSelectionV1.optional(),
  ttlMs: z.number().int().positive().optional(),
})

export const quoteResponseV1 = z.object({
  quoteId: z.string(),
  quotedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  available: z.boolean(),
  invalidReason: z.string().optional(),
  shape: bookingRequirementsV1.optional(),
  pricing: pricingBreakdownV1.optional(),
  upstreamPayload: z.record(z.string(), z.unknown()).optional(),
})

export const quoteBatchCriteriaV1 = z.object({
  checkIn: z.string().min(1).optional(),
  checkOut: z.string().min(1).optional(),
  occupancy: z.record(z.string(), z.number().int().nonnegative()).optional(),
  roomCount: z.number().int().positive().optional(),
})

export const quoteBatchSelectionV1 = z.object({
  entityModule: z.string(),
  entityId: z.string(),
  ratePlanId: z.string().optional(),
  sourceKind: z.string().optional(),
  sourceProvider: z.string().optional(),
  sourceConnectionId: z.string().optional(),
  sourceRef: z.string().optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
  draft: z.record(z.string(), z.unknown()).optional(),
})

export const quoteBatchRequestV1 = z.object({
  criteria: quoteBatchCriteriaV1.optional(),
  scope: quoteScopeV1.partial().optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
  draft: z.record(z.string(), z.unknown()).optional(),
  ttlMs: z.number().int().positive().optional(),
  selections: z.array(quoteBatchSelectionV1).min(1).max(30),
})

export const quoteBatchResultV1 = quoteResponseV1.extend({
  selection: quoteBatchSelectionV1,
})

export const quoteBatchResponseV1 = z.object({
  results: z.array(quoteBatchResultV1),
})

/**
 * Mirrors flights' `paymentIntent` discriminated union from
 * `catalog-flights-architecture.md` §3.1. Default `{ type: "hold" }`
 * when omitted. Kept in lockstep with `bookRequestV1.paymentIntent`.
 */
export const bookingReservationPaymentIntentV1 = z.union([
  z.object({ type: z.literal("hold") }),
  z.object({ type: z.literal("card"), tokenizedCard: z.string().min(1) }),
  z.object({ type: z.literal("ticket_on_credit"), agencyAccount: z.string().min(1) }),
])

export type BookingPaymentIntent = z.infer<typeof bookingReservationPaymentIntentV1>

export const bookRequestV1 = z
  .object({
    quoteId: z.string().optional(),
    draftId: z.string().optional(),
    bookingId: z.string().optional(),
    party: z.record(z.string(), z.unknown()).optional(),
    paymentIntent: bookingReservationPaymentIntentV1.optional(),
    parameters: z.record(z.string(), z.unknown()).optional(),
    /** Idempotency — same key in 24h returns the existing booking. */
    idempotencyKey: z.string().min(8).max(128).optional(),
  })
  .refine((v) => v.quoteId || v.draftId, {
    message: "either quoteId or draftId must be provided",
  })

export const bookResponseV1 = z.object({
  bookingId: z.string(),
  orderRef: z.string(),
  status: z.enum(["held", "confirmed", "ticketed", "failed"]),
  snapshotId: z.string(),
  pricing: pricingBreakdownV1.optional(),
  upstreamPayload: z.record(z.string(), z.unknown()).optional(),
})

export type QuoteRequestV1 = z.infer<typeof quoteRequestV1>
export type QuoteResponseV1 = z.infer<typeof quoteResponseV1>
export type QuoteBatchCriteriaV1 = z.infer<typeof quoteBatchCriteriaV1>
export type QuoteBatchSelectionV1 = z.infer<typeof quoteBatchSelectionV1>
export type QuoteBatchRequestV1 = z.infer<typeof quoteBatchRequestV1>
export type QuoteBatchResultV1 = z.infer<typeof quoteBatchResultV1>
export type QuoteBatchResponseV1 = z.infer<typeof quoteBatchResponseV1>
export type BookRequestV1 = z.infer<typeof bookRequestV1>
export type BookResponseV1 = z.infer<typeof bookResponseV1>

// ─────────────────────────────────────────────────────────────────
// Hold lifecycle as separate operations — earlier drafts buried
// hold inside reserve/cancel; making it explicit lets adapters
// expose extend semantics without faking a full reserve.
// ─────────────────────────────────────────────────────────────────

export const holdExtendRequestV1 = z.object({ holdToken: z.string() })
export const holdReleaseRequestV1 = z.object({ holdToken: z.string() })

export type HoldExtendRequestV1 = z.infer<typeof holdExtendRequestV1>
export type HoldReleaseRequestV1 = z.infer<typeof holdReleaseRequestV1>

/**
 * Capability flag a handler / adapter declares to opt into the V1
 * contracts above. The engine refuses to dispatch to a handler whose
 * declared version doesn't match the request.
 */
export const ENGINE_CONTRACT_V1 = "v1" as const
export type EngineContractVersion = typeof ENGINE_CONTRACT_V1
