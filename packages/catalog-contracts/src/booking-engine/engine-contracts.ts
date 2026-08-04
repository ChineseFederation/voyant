/** Booking-engine request and response V1 schemas. */

import { z } from "zod"

import { pricingBreakdownV1 } from "./pricing-contracts.js"

// ─────────────────────────────────────────────────────────────────
// Engine request / response contracts
//
// The beta quote contracts that used to live here — `quoteScopeV1`,
// `quoteRequestV1`, `quoteResponseV1` and the `quoteBatch*` family — are
// deleted, not deprecated (voyant#4188). Their lifecycle was replaced by the
// v1 Booking Session (`session-contracts.ts`) and the stateless Offer Preview
// (`preview-contracts.ts`); a quote is now either a Session-bound
// `bookingQuoteRecordV1` or a non-binding `offerPreviewResultV1`, and neither
// is expressible in the beta shape.
// ─────────────────────────────────────────────────────────────────

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
