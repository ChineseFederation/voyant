import { z } from "zod"
import { bookingLifecycleCommitOutcomeV1 } from "./lifecycle-conformance.js"
import { pricingBreakdownV1 } from "./pricing-contracts.js"
import { bookingRequirementsV1 } from "./requirements-contracts.js"
import { unsatisfiedRequirementV1 } from "./requirements-validation.js"

export const bookingSessionActorKindV1 = z.enum(["anonymous", "customer", "staff", "partner"])
export type BookingSessionActorKindV1 = z.infer<typeof bookingSessionActorKindV1>

export const bookingSessionTargetV1 = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("product"),
      productId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("catalog_item"),
      catalogItemId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("owned_entity"),
      entityModule: z.string().min(1),
      entityId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("trip_snapshot"),
      tripSnapshotId: z.string().min(1),
      tripEnvelopeId: z.string().min(1),
    })
    .strict(),
])
export type BookingSessionTargetV1 = z.infer<typeof bookingSessionTargetV1>

/** Server-owned provenance. Public Session-create callers cannot supply this. */
export const bookingSessionOriginV1 = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("accepted_proposal_version"),
    proposalId: z.string().min(1),
    proposalVersionId: z.string().min(1),
    tripSnapshotId: z.string().min(1),
  }),
])
export type BookingSessionOriginV1 = z.infer<typeof bookingSessionOriginV1>

/**
 * The commercial and presentation scope a Session is quoted in.
 *
 * Requirements labels are locale-derived and prices are market-derived, so a
 * Session that cannot say which locale and market it belongs to quotes every
 * shopper in the default market with English labels. Fixed at create: a
 * Session's Quotes, Holds and Commit must all mean the same money, so PATCH
 * carries no scope and a re-scope is a new Session.
 *
 * `audience` is deliberately NOT part of this contract. It is derived
 * server-side from the Session's `actorKind` (see
 * `bookingSessionAudienceForActorV1`), never taken from the request: audience
 * selects staff-visible content and staff/partner price tiers, so accepting it
 * on the wire would let any public caller ask for staff pricing by naming it.
 * That derivation is the load-bearing security property of this scope.
 */
export const bookingSessionScopeV1 = z.object({
  locale: z.string().min(2),
  market: z.string().min(1),
  currency: z.string().length(3).optional(),
})
export type BookingSessionScopeV1 = z.infer<typeof bookingSessionScopeV1>

/** What existing and unscoped Sessions were quoted at before scope existed. */
export const DEFAULT_BOOKING_SESSION_SCOPE: BookingSessionScopeV1 = {
  locale: "en",
  market: "default",
}

export const bookingSessionAudienceV1 = z.enum(["customer", "staff", "partner"])
export type BookingSessionAudienceV1 = z.infer<typeof bookingSessionAudienceV1>

/**
 * The one derivation of quoting audience from who owns the Session. Kept here
 * rather than at each call site so a new caller cannot invent a third answer.
 */
export function bookingSessionAudienceForActorV1(
  actorKind: BookingSessionActorKindV1,
): BookingSessionAudienceV1 {
  if (actorKind === "staff") return "staff"
  if (actorKind === "partner") return "partner"
  return "customer"
}

export const bookingSessionStateV1 = z.enum([
  "active",
  "supplier_pending",
  "component_pending",
  "consumed",
  "expired",
  "abandoned",
])
export type BookingSessionStateV1 = z.infer<typeof bookingSessionStateV1>

export const bookingSessionCapabilityActionV1 = z.enum([
  "read",
  "update",
  "quote",
  "hold",
  "commit",
  "abandon",
  "adopt",
  "renew",
])
export type BookingSessionCapabilityActionV1 = z.infer<typeof bookingSessionCapabilityActionV1>

export const bookingSessionRecordV1 = z.object({
  id: z.string().min(1),
  target: bookingSessionTargetV1,
  origin: bookingSessionOriginV1.optional(),
  actorKind: bookingSessionActorKindV1,
  state: bookingSessionStateV1,
  revision: z.number().int().positive(),
  /**
   * The commercial scope this Session quotes in. Always present — a Session
   * that could not name its locale and market is what made every v1 quote
   * land in the default market with English labels.
   */
  scope: bookingSessionScopeV1,
  /**
   * Server-owned Booking Requirements for this Session's target — what a
   * booking of it requires, and therefore which wizard steps a host renders.
   *
   * It rides the Session and not only the Quote because a host must draw the
   * Configure step *before* it can quote: requirements on the Quote alone
   * would leave it needing a price to render its first screen.
   *
   * Rule: present whenever the Session is `active` and its target resolves;
   * absent for terminal (`consumed` / `expired` / `abandoned`) or purged
   * Sessions, whose target is no longer re-derived.
   */
  requirements: bookingRequirementsV1.optional(),
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type BookingSessionRecordV1 = z.infer<typeof bookingSessionRecordV1>

export const bookingSessionViewV1 = bookingSessionRecordV1.extend({
  selection: z.record(z.string(), z.unknown()).optional(),
  redaction: z.enum(["none", "selection_omitted"]),
})
export type BookingSessionViewV1 = z.infer<typeof bookingSessionViewV1>

export const createBookingSessionTargetV1 = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("product"),
      productId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("catalog_item"),
      catalogItemId: z.string().min(1),
    })
    .strict(),
])
export type CreateBookingSessionTargetV1 = z.infer<typeof createBookingSessionTargetV1>

export const createBookingSessionV1 = z.object({
  idempotencyKey: z.string().min(8).max(128),
  target: createBookingSessionTargetV1,
  selection: z.record(z.string(), z.unknown()).optional(),
  /**
   * Commercial scope for the whole Session. Omitted falls back to
   * `DEFAULT_BOOKING_SESSION_SCOPE`. There is no `audience` here on purpose —
   * see `bookingSessionScopeV1`.
   */
  scope: bookingSessionScopeV1.optional(),
  capabilityScopes: z.array(bookingSessionCapabilityActionV1).min(1).optional(),
})
export type CreateBookingSessionV1 = z.input<typeof createBookingSessionV1>

export const createAcceptedProposalBookingSessionV1 = z.object({
  idempotencyKey: z.string().min(8).max(128),
  proposalId: z.string().min(1),
  proposalVersionId: z.string().min(1),
  tripSnapshotId: z.string().min(1),
  tripEnvelopeId: z.string().min(1),
  selection: z.record(z.string(), z.unknown()).optional(),
  scope: bookingSessionScopeV1.optional(),
})
export type CreateAcceptedProposalBookingSessionV1 = z.input<
  typeof createAcceptedProposalBookingSessionV1
>

/**
 * Carries no `scope`: the Session's commercial scope is fixed at create so a
 * Quote, its Hold, and the Commit that consumes them cannot end up meaning
 * three different prices. Re-scoping is a new Session.
 */
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
  /**
   * The Booking Requirements this price was computed against. Required —
   * a Quote always has a resolvable target, and the requirements a host
   * renders must be the same derivation the Commit later validates.
   */
  requirements: bookingRequirementsV1,
  /**
   * Fingerprint of `requirements`, computed the same way `priceFingerprint`
   * is. The client echoes it back on Commit and the server re-derives and
   * compares, so a Commit collected against a stale descriptor is rejected
   * instead of silently booking the wrong field set.
   */
  requirementsFingerprint: z.string().min(1),
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
  /**
   * The `requirementsFingerprint` of the Quote the client actually rendered
   * against. Required, not optional: a Commit that cannot say which descriptor
   * it collected is a Commit nobody can validate, which is how a host ends up
   * booking a field set the server never published (voyant#4113).
   */
  requirementsFingerprint: z.string().min(1),
  /** Required for owned inventory; sourced targets may commit without a Hold. */
  holdId: z.string().min(1).optional(),
  idempotencyKey: z.string().min(8).max(128),
  payment: z
    .object({
      /**
       * Where the shopper is sent back to once a redirect handoff completes.
       * Required in practice for the redirect arm and irrelevant to `embedded`
       * — nobody is sent anywhere — but still accepted there, because an
       * issuer authentication step wants a URL to return to.
       */
      returnUrl: z.string().url().optional(),
      cancelUrl: z.string().url().optional(),
      /**
       * The checkout handoffs this storefront can render, most-preferred first.
       *
       * Absent means `["redirect"]`, so a page built before in-page checkout
       * existed keeps getting a hosted page rather than a client secret it
       * cannot mount. The storefront is the only party that knows what it can
       * render, and the Booking Session is the only path between it and the
       * adapter: the commit forwards this to
       * `PaymentInitiationInput.acceptedCheckoutHandoffs` verbatim and
       * interprets none of it, because the adapter's own capabilities decide
       * the outcome through `negotiatePaymentCheckoutHandoff` (voyant#4346).
       *
       * Mirrors `PaymentCheckoutHandoff` from `@voyant-travel/payments`, which
       * a contracts package describes rather than imports. The mirror is pinned
       * by the commit forwarding it into a `readonly PaymentCheckoutHandoff[]`
       * argument, so an arm added here and nowhere else fails the build.
       */
      acceptedCheckoutHandoffs: z
        .array(z.enum(["redirect", "embedded"]))
        .min(1)
        .optional(),
    })
    .optional(),
})
export type CommitBookingSessionV1 = z.input<typeof commitBookingSessionV1>

export const abandonBookingSessionV1 = z.object({
  idempotencyKey: z.string().min(8).max(128),
  expectedRevision: z.number().int().positive(),
})
export type AbandonBookingSessionV1 = z.input<typeof abandonBookingSessionV1>

export const adoptBookingSessionV1 = z.object({
  idempotencyKey: z.string().min(8).max(128),
  expectedRevision: z.number().int().positive(),
})
export type AdoptBookingSessionV1 = z.input<typeof adoptBookingSessionV1>

export const renewBookingSessionV1 = z.object({
  idempotencyKey: z.string().min(8).max(128),
  expectedRevision: z.number().int().positive(),
  extendBySeconds: z.number().int().positive(),
})
export type RenewBookingSessionV1 = z.input<typeof renewBookingSessionV1>

/**
 * Why a target could not be priced. Named rather than inlined because the
 * stateless Offer Preview reports the same set (`offerPreviewResultV1`) — a
 * preview and a Session Quote of the same target must fail for the same
 * reasons under the same names.
 */
export const bookingQuoteUnavailableReasonV1 = z.enum([
  "target_not_found",
  "target_not_bookable",
  "price_unavailable",
  "policy_unavailable",
  "selection_unavailable",
])
export type BookingQuoteUnavailableReasonV1 = z.infer<typeof bookingQuoteUnavailableReasonV1>

export const bookingSessionLifecycleErrorV1 = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("revision_conflict"),
    expectedRevision: z.number().int().positive(),
    actualRevision: z.number().int().positive(),
    actualState: bookingSessionStateV1,
  }),
  z.object({ kind: z.literal("session_expired") }),
  z.object({ kind: z.literal("session_consumed") }),
  z.object({ kind: z.literal("capability_required") }),
  z.object({
    kind: z.literal("capability_scope_required"),
    action: bookingSessionCapabilityActionV1,
  }),
  z.object({ kind: z.literal("not_authorized") }),
  z.object({ kind: z.literal("idempotency_conflict") }),
  z.object({
    kind: z.literal("supplier_operation_active"),
    nextAction: z.literal("reconcile_supplier_operation"),
  }),
  z.object({
    kind: z.literal("quote_unavailable"),
    /**
     * Requirements survive unavailability: a priced-out or sold-out target
     * must still render a correct wizard so the buyer can change the
     * selection that made it unavailable. Absent only when the target
     * itself failed to resolve.
     */
    requirements: bookingRequirementsV1.optional(),
    reason: bookingQuoteUnavailableReasonV1,
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
    /**
     * The selection does not answer the Booking Requirements the server
     * published. Recoverable: `unsatisfied` names every declared requirement
     * the selection misses, so the host can fix all of them in one pass
     * instead of round-tripping per field.
     */
    kind: z.literal("selection_incomplete"),
    unsatisfied: z.array(unsatisfiedRequirementV1).min(1),
    nextAction: z.literal("update_selection"),
  }),
  z.object({
    /**
     * The Booking Requirements re-derived at Commit are not the ones the
     * client rendered against. Recoverable the same way a changed price is:
     * take a fresh Quote, which carries the current descriptor.
     */
    kind: z.literal("requirements_changed"),
    requirementsFingerprint: z.string().min(1),
    nextAction: z.literal("request_fresh_quote"),
  }),
  z.object({
    kind: z.literal("invalid_selection"),
    reason: z.enum(["unsupported_target", "forbidden_field"]),
    path: z.string().min(1).optional(),
  }),
  z.object({
    kind: z.literal("renewal_not_allowed"),
    reason: z.enum(["session_not_active", "extension_too_large", "absolute_lifetime_exceeded"]),
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
  }),
  z.object({ kind: z.literal("session_updated"), session: bookingSessionRecordV1 }),
  z.object({ kind: z.literal("session_resumed"), session: bookingSessionViewV1 }),
  z.object({ kind: z.literal("session_adopted"), session: bookingSessionViewV1 }),
  z.object({ kind: z.literal("session_renewed"), session: bookingSessionRecordV1 }),
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
