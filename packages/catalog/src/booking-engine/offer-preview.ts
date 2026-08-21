/**
 * Offer Preview — the stateless read behind a storefront detail page.
 *
 * A shopper moving a pax stepper is not yet an attempt to book, so this path
 * must not open a Booking Session: Sessions are persisted, revisioned,
 * capability-bearing, expiring rows that a sweep has to reap, and one per
 * keystroke floods `booking_sessions`.
 *
 * The preview therefore builds an ephemeral, in-memory session-shaped value,
 * hands it to the SAME `composeRequirements` / `composeQuote` ports the
 * Session lifecycle uses, and throws it away. It never touches the repository
 * — there is deliberately no `BookingSessionRepository` in
 * {@link OfferPreviewPorts}, so "persists nothing" is a property of the
 * function's dependencies rather than a rule someone has to remember.
 *
 * Reusing the Session's ports is the point: a third derivation path is exactly
 * how the price a detail page shows would come to disagree with the price the
 * wizard quotes.
 */

import type {
  OfferPreviewOutcomeV1,
  OfferPreviewRequestV1,
  OfferPreviewResultV1,
} from "@voyant-travel/catalog-contracts/booking-engine/preview-contracts"
import type { BookingQuoteUnavailableReasonV1 } from "@voyant-travel/catalog-contracts/booking-engine/session-contracts"

import type { BookingRequirementsV1 } from "./contracts.js"
import { InvalidBookingSessionSelectionError } from "./errors.js"
import type {
  BookingSessionAccessContext,
  BookingSessionInternalRecord,
  BookingSessionModulePorts,
} from "./sessions-service.js"

/**
 * Exactly the ports a preview may reach, and no more.
 *
 * Notably absent: `repository`. A preview cannot write a Session, a Quote, a
 * Hold, an operation claim or an audit row because it is not given anything
 * that could.
 */
export type OfferPreviewPorts = Pick<
  BookingSessionModulePorts,
  "normalizeSelection" | "composeRequirements" | "composeQuote"
>

/**
 * The id on the ephemeral record.
 *
 * A constant rather than `newId(...)`: minting a typeid — even one that is
 * discarded — would make this operation an identifier factory, and the whole
 * point of a preview is that there is no identifier for a caller to present
 * later as authority. Nothing downstream reads it; `composeRequirements` and
 * `composeQuote` derive from the target, the selection, the scope and the
 * actor kind only.
 */
const EPHEMERAL_PREVIEW_SESSION_ID = "offer-preview"

/**
 * Read what a target would cost and what booking it would require, without
 * opening a Booking Session.
 *
 * `at` is passed in rather than read from the clock so a preview is
 * deterministic for a given `(target, scope, selection)` and therefore
 * cacheable.
 */
export async function previewOffer(
  ports: OfferPreviewPorts,
  input: OfferPreviewRequestV1,
  access: BookingSessionAccessContext,
  at: Date,
): Promise<OfferPreviewOutcomeV1> {
  if (access.actorKind !== "anonymous" && !access.principalId?.trim()) {
    return { kind: "rejected", error: { kind: "not_authorized" } }
  }

  let statePayload: Record<string, unknown>
  try {
    // The same normalization the Session create path runs, so a public caller
    // cannot smuggle a staff-only or engine-owned selection key into the
    // derivation and price against it.
    statePayload = await ports.normalizeSelection({
      target: input.target,
      selection: (input.selection ?? {}) as Record<string, unknown>,
      access,
      now: at,
    })
  } catch (error) {
    if (error instanceof InvalidBookingSessionSelectionError) {
      return {
        kind: "rejected",
        error: {
          kind: "invalid_selection",
          reason: error.reason,
          ...(error.path ? { path: error.path } : {}),
        },
      }
    }
    throw error
  }

  const session = ephemeralPreviewSession(input, access, statePayload, at)

  // No transaction: a preview has no Session row to lock, and both compose
  // ports are read-only and accept a nullish `tx`.
  const composed = await ports.composeQuote({ session, now: at, tx: undefined })
  if (composed.status === "quoted") {
    return {
      kind: "offer_preview",
      preview: previewResult(true, composed.requirements, { pricing: composed.pricing }),
    }
  }

  // Unavailability must not collapse the wizard: a sold-out or unpriced target
  // still has to render controls the shopper can change. `composeQuote` carries
  // the descriptor through its unavailable exit whenever the target resolved;
  // when it did not, ask the requirements derivation directly before giving up.
  const requirements =
    composed.requirements ?? (await deriveRequirements(ports, session, at)) ?? undefined
  if (!requirements) {
    return {
      kind: "rejected",
      error: {
        kind: "quote_unavailable",
        reason: composed.reason,
        nextAction: composed.nextAction,
      },
    }
  }
  return {
    kind: "offer_preview",
    preview: previewResult(false, requirements, { unavailableReason: composed.reason }),
  }
}

async function deriveRequirements(
  ports: OfferPreviewPorts,
  session: BookingSessionInternalRecord,
  at: Date,
): Promise<BookingRequirementsV1 | null> {
  const resolved = await ports.composeRequirements({ session, now: at, tx: undefined })
  return resolved.status === "available" ? resolved.requirements : null
}

/**
 * Build the result.
 *
 * Written as one constructor so there is a single place the shape is decided,
 * and so the "no identifier" invariant is visible: nothing here can attach an
 * `id`, a `quoteId` or a token, because none is in scope.
 */
function previewResult(
  available: boolean,
  requirements: BookingRequirementsV1,
  extra: {
    pricing?: OfferPreviewResultV1["pricing"]
    unavailableReason?: BookingQuoteUnavailableReasonV1
  },
): OfferPreviewResultV1 {
  return {
    binding: false,
    available,
    requirements,
    ...(extra.pricing ? { pricing: extra.pricing } : {}),
    ...(extra.unavailableReason ? { unavailableReason: extra.unavailableReason } : {}),
  }
}

/**
 * A session-shaped value that exists only for the duration of one call.
 *
 * `actorKind` is copied from the transport-resolved access context and never
 * from the request body, because the compose ports derive the quoting audience
 * from it (`bookingSessionAudienceForActorV1`). That is what stops a
 * storefront visitor from previewing at staff or partner price tiers.
 */
function ephemeralPreviewSession(
  input: OfferPreviewRequestV1,
  access: BookingSessionAccessContext,
  statePayload: Record<string, unknown>,
  at: Date,
): BookingSessionInternalRecord {
  return {
    id: EPHEMERAL_PREVIEW_SESSION_ID,
    createIdempotencyKey: EPHEMERAL_PREVIEW_SESSION_ID,
    createRequestFingerprint: EPHEMERAL_PREVIEW_SESSION_ID,
    capabilityScopes: [],
    target: input.target,
    actorKind: access.actorKind,
    ...(access.actorKind === "anonymous" ? {} : { ownerPrincipalId: access.principalId }),
    ...(access.actorKind === "staff" || !access.publicApiOrigin
      ? {}
      : { publicApiOrigin: access.publicApiOrigin }),
    // Rebuilt field by field rather than spread: the request schema already
    // strips an `audience` the caller named, and reconstructing it here means
    // a direct service caller cannot smuggle one in either.
    scope: {
      locale: input.scope.locale,
      market: input.scope.market,
      ...(input.scope.currency ? { currency: input.scope.currency } : {}),
    },
    state: "active",
    revision: 1,
    statePayload,
    expiresAt: at,
    createdAt: at,
    updatedAt: at,
  }
}
