import { z } from "zod"

import { pricingBreakdownV1 } from "./draft-contracts.js"
import { bookingLifecycleCommitOutcomeV1 } from "./lifecycle-conformance.js"

export const bookingSessionActorKindV1 = z.enum(["anonymous", "customer", "staff", "partner"])
export type BookingSessionActorKindV1 = z.infer<typeof bookingSessionActorKindV1>

export const bookingSessionTargetV1 = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("product"),
    productId: z.string().min(1),
    catalogItemId: z.never().optional(),
  }),
  z.object({
    kind: z.literal("catalog_item"),
    catalogItemId: z.string().min(1),
    productId: z.never().optional(),
  }),
])
export type BookingSessionTargetV1 = z.infer<typeof bookingSessionTargetV1>

export const bookingSessionStateV1 = z.enum(["active", "consumed", "expired", "abandoned"])
export type BookingSessionStateV1 = z.infer<typeof bookingSessionStateV1>

export const bookingSessionRecordV1 = z.object({
  id: z.string().min(1),
  target: bookingSessionTargetV1,
  actorKind: bookingSessionActorKindV1,
  state: bookingSessionStateV1,
  revision: z.number().int().positive(),
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type BookingSessionRecordV1 = z.infer<typeof bookingSessionRecordV1>

export const bookingSessionCreationSecretV1 = z.object({
  token: z.string().min(16),
  transport: z.enum(["header", "cookie"]),
  headerName: z.literal("Voyant-Booking-Session-Capability"),
})
export type BookingSessionCreationSecretV1 = z.infer<typeof bookingSessionCreationSecretV1>

export const createBookingSessionV1 = z.object({
  idempotencyKey: z.string().min(8).max(128),
  target: bookingSessionTargetV1,
  selection: z.record(z.string(), z.unknown()).optional(),
})
export type CreateBookingSessionV1 = z.input<typeof createBookingSessionV1>

export const updateBookingSessionV1 = z.object({
  idempotencyKey: z.string().min(8).max(128),
  expectedRevision: z.number().int().positive(),
  selection: z.record(z.string(), z.unknown()),
})
export type UpdateBookingSessionV1 = z.input<typeof updateBookingSessionV1>

export const quoteBookingSessionV1 = z.object({
  expectedRevision: z.number().int().positive(),
  idempotencyKey: z.string().min(8).max(128),
})
export type QuoteBookingSessionV1 = z.input<typeof quoteBookingSessionV1>

export const bookingSessionQuoteLifecycleStateV1 = z.enum([
  "active",
  "superseded",
  "consumed",
  "expired",
])
export type BookingSessionQuoteLifecycleStateV1 = z.infer<
  typeof bookingSessionQuoteLifecycleStateV1
>

export const bookingQuoteRecordV1 = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  sessionRevision: z.number().int().positive(),
  state: bookingSessionQuoteLifecycleStateV1,
  pricing: pricingBreakdownV1,
  quotedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
})
export type BookingQuoteRecordV1 = z.infer<typeof bookingQuoteRecordV1>

export const placeBookingHoldV1 = z.object({
  expectedRevision: z.number().int().positive(),
  quoteId: z.string().min(1),
  quantity: z.number().int().positive().default(1),
  idempotencyKey: z.string().min(8).max(128),
})
export type PlaceBookingHoldV1 = z.input<typeof placeBookingHoldV1>

export const bookingHoldStateV1 = z.enum(["active", "converted", "released", "expired"])
export type BookingHoldStateV1 = z.infer<typeof bookingHoldStateV1>

export const bookingHoldRecordV1 = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  quoteId: z.string().min(1),
  target: bookingSessionTargetV1,
  quantity: z.number().int().positive(),
  state: bookingHoldStateV1,
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
})
export type BookingHoldRecordV1 = z.infer<typeof bookingHoldRecordV1>

export const commitBookingSessionV1 = z.object({
  expectedRevision: z.number().int().positive(),
  quoteId: z.string().min(1),
  holdId: z.string().min(1),
  idempotencyKey: z.string().min(8).max(128),
})
export type CommitBookingSessionV1 = z.input<typeof commitBookingSessionV1>

export const abandonBookingSessionV1 = z.object({
  idempotencyKey: z.string().min(8).max(128),
  expectedRevision: z.number().int().positive(),
})
export type AbandonBookingSessionV1 = z.input<typeof abandonBookingSessionV1>

export const bookingSessionLifecycleErrorV1 = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("revision_conflict"),
    expectedRevision: z.number().int().positive(),
    actualRevision: z.number().int().positive(),
  }),
  z.object({ kind: z.literal("session_expired") }),
  z.object({ kind: z.literal("session_consumed") }),
  z.object({ kind: z.literal("capability_required") }),
  z.object({ kind: z.literal("not_authorized") }),
  z.object({ kind: z.literal("idempotency_conflict") }),
  z.object({
    kind: z.literal("quote_unavailable"),
    reason: z.enum([
      "target_not_found",
      "target_not_bookable",
      "price_unavailable",
      "selection_unavailable",
    ]),
    nextAction: z.enum(["select_alternative_inventory", "contact_operator", "update_selection"]),
  }),
  z.object({
    kind: z.literal("commit_rejected"),
    reason: z.enum([
      "entity_not_found",
      "entity_not_bookable",
      "incomplete_draft",
      "price_changed",
    ]),
    nextAction: z.enum(["select_alternative_inventory", "update_selection", "request_fresh_quote"]),
  }),
  z.object({
    kind: z.literal("invalid_selection"),
    reason: z.enum(["unsupported_target", "forbidden_field"]),
    path: z.string().min(1).optional(),
  }),
  z.object({
    kind: z.literal("quote_required"),
    nextAction: z.literal("request_fresh_quote"),
  }),
  z.object({
    kind: z.enum(["quote_expired", "quote_superseded"]),
    nextAction: z.literal("request_fresh_quote"),
  }),
  z.object({
    kind: z.enum(["hold_required", "hold_expired", "availability_changed"]),
    nextAction: z.literal("request_new_hold"),
  }),
  z.object({
    kind: z.literal("hold_quantity_mismatch"),
    requestedQuantity: z.number().int().positive(),
    expectedQuantity: z.number().int().positive(),
    nextAction: z.literal("request_new_hold"),
  }),
  z.object({
    kind: z.literal("commit_already_consumed"),
    nextAction: z.literal("return_idempotent_result"),
  }),
])
export type BookingSessionLifecycleErrorV1 = z.infer<typeof bookingSessionLifecycleErrorV1>

export const bookingSessionOutcomeV1 = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("session_created"),
    session: bookingSessionRecordV1,
    capability: bookingSessionCreationSecretV1.optional(),
  }),
  z.object({ kind: z.literal("session_updated"), session: bookingSessionRecordV1 }),
  z.object({ kind: z.literal("session_abandoned"), session: bookingSessionRecordV1 }),
  z.object({
    kind: z.literal("quote_created"),
    session: bookingSessionRecordV1,
    quote: bookingQuoteRecordV1,
  }),
  z.object({
    kind: z.literal("hold_created"),
    session: bookingSessionRecordV1,
    hold: bookingHoldRecordV1,
  }),
  z.object({ kind: z.literal("commit_result"), outcome: bookingLifecycleCommitOutcomeV1 }),
  z.object({ kind: z.literal("rejected"), error: bookingSessionLifecycleErrorV1 }),
])
export type BookingSessionOutcomeV1 = z.infer<typeof bookingSessionOutcomeV1>
