/**
 * Offer Preview V1 — a stateless, non-binding read of what a target would
 * cost and what booking it would require.
 *
 * A storefront detail page has to show a live price and render the right
 * configuration controls *before* the shopper has done anything that looks
 * like booking. Moving a pax stepper is not an attempt to book, so it must not
 * mint a Booking Session: Sessions are persisted, revisioned,
 * capability-bearing, expiring rows that a sweep has to reap, and one per
 * keystroke floods `booking_sessions` at real traffic.
 *
 * This is deliberately NOT beta's `POST /catalog/quote` under a new name. Four
 * structural invariants keep it from drifting back into one:
 *
 * 1. It mints no identifier — the result carries no `id`, no `quoteId`, no
 *    token of any kind, so there is nothing to present later as authority.
 * 2. It persists nothing — no Session row, no Quote row, no capability cookie.
 * 3. It says `binding: false` explicitly rather than leaving it to be inferred.
 * 4. Because it has no id at all, the result is not assignable anywhere a
 *    `quoteId` is required (`commitBookingSessionV1`, `placeBookingHoldV1`).
 *    `preview-contracts.test.ts` asserts the absence of those keys so a future
 *    field addition cannot quietly undo it.
 *
 * A fifth property follows: for a given `(target, scope, selection)` the read
 * is deterministic and therefore cacheable.
 */

import { z } from "zod"
import { pricingBreakdownV1 } from "./pricing-contracts.js"
import { bookingRequirementsV1 } from "./requirements-contracts.js"
import { bookingSelectionPublicV1 } from "./selection-contracts.js"
import {
  bookingQuoteUnavailableReasonV1,
  bookingSessionLifecycleErrorV1,
  bookingSessionScopeV1,
  createBookingSessionTargetV1,
} from "./session-contracts.js"

/**
 * What a detail page asks about.
 *
 * The target union, the commercial scope and the public selection schema are
 * the same ones the Session create path takes — a preview that could describe
 * a target the Session plane cannot open would be quoting something the
 * shopper can never buy.
 *
 * There is no `audience` here for the same reason `bookingSessionScopeV1` has
 * none: audience selects staff/partner price tiers and staff-visible content,
 * so it is derived server-side from the caller's `actorKind`. Accepting it on
 * the wire would let any storefront visitor ask for staff pricing by name.
 */
export const offerPreviewRequestV1 = z.object({
  target: createBookingSessionTargetV1,
  scope: bookingSessionScopeV1,
  selection: bookingSelectionPublicV1.optional(),
})
export type OfferPreviewRequestV1 = z.input<typeof offerPreviewRequestV1>

/**
 * The non-binding result.
 *
 * `requirements` is REQUIRED, and that is the load-bearing part of the shape:
 * a detail page must be able to draw its pax steppers, date pickers and option
 * lists even when the target is sold out or unpriced. Requirements that
 * evaporated with the price would leave the shopper unable to change the very
 * selection that made it unavailable.
 *
 * `pricing` is what is optional. `available: false` plus `unavailableReason`
 * says why there is no number to show.
 */
export const offerPreviewResultV1 = z.object({
  /** Never true. A preview confers no price protection and no capacity. */
  binding: z.literal(false),
  available: z.boolean(),
  requirements: bookingRequirementsV1,
  pricing: pricingBreakdownV1.optional(),
  unavailableReason: bookingQuoteUnavailableReasonV1.optional(),
})
export type OfferPreviewResultV1 = z.infer<typeof offerPreviewResultV1>

/**
 * Preview outcome, shaped like `bookingSessionOutcomeV1`: rejections are
 * carried in the 200 body rather than as transport errors, so a host reads one
 * discriminated union instead of branching on status codes.
 *
 * Rejections reuse `bookingSessionLifecycleErrorV1` rather than declaring a
 * parallel error vocabulary — a preview can only fail the ways a Session read
 * of the same target fails (`not_authorized`, `invalid_selection`,
 * `quote_unavailable`).
 */
export const offerPreviewOutcomeV1 = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("offer_preview"), preview: offerPreviewResultV1 }),
  z.object({ kind: z.literal("rejected"), error: bookingSessionLifecycleErrorV1 }),
])
export type OfferPreviewOutcomeV1 = z.infer<typeof offerPreviewOutcomeV1>
