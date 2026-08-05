/**
 * Booking Session lifecycle → product-analytics events.
 *
 * Written as a decorator over {@link BookingSessionModule} rather than as
 * `analytics.track(...)` calls scattered through `sessions-service.ts`, for
 * three reasons:
 *
 *  1. **Every lifecycle outcome is already one value.** Each method answers a
 *     single discriminated `bookingSessionOutcomeV1`, so the outcome-to-event
 *     mapping is total and reviewable in one place instead of being spread
 *     across the ~40 return sites of a 2,500-line service.
 *  2. **`failure_reason` stays honest.** It is derived from the contract's own
 *     rejection kinds — the thing the API already returned to the caller — so
 *     it cannot drift into a hand-written message string. That is the single
 *     property this whole effort exists for: it turns "conversion dropped"
 *     into "13 of 39 product options are unbookable because a descriptor
 *     withheld a step the commit required" (voyant#4113, undetected for nine
 *     days).
 *  3. **Instrumentation cannot change behaviour.** The decorator returns the
 *     service's own value untouched, and every emission is fire-and-forget
 *     through `createSafeAnalytics`, so an analytics defect cannot fail,
 *     block, or slow a booking.
 *
 * Unbound is the default: `createBookingSessionModule` without an `analytics`
 * option returns the undecorated module, so a deployment that binds nothing
 * pays nothing.
 */

import type {
  BookingSessionLifecycleErrorV1,
  BookingSessionOutcomeV1,
  BookingSessionRecordV1,
  BookingSessionTargetV1,
  OfferPreviewOutcomeV1,
} from "@voyant-travel/catalog-contracts/booking-engine/contracts"
import {
  type AnalyticsEmitter,
  type AnalyticsFailureReason,
  type AnalyticsProperties,
  analyticsFailureReason,
  analyticsProperties,
} from "@voyant-travel/core/analytics"

import type { BookingSessionModule } from "./sessions-service.js"

/**
 * The furthest lifecycle step observed for a Session, and when its live Quote
 * was issued.
 *
 * Both answer questions the outcome alone cannot: `engine.session.abandoned`
 * needs to know where the buyer stopped, and `engine.quote.expired` needs the
 * issue time of a Quote that is, by then, gone. Best-effort and in-process by
 * design — this is a funnel signal, not a ledger, and paying a database read
 * to sharpen it would put analytics on the booking path, which is exactly what
 * the port forbids.
 */
interface SessionProgress {
  lastStep: BookingJourneyStep
  quotedAtMs?: number
}

export type BookingJourneyStep = "create" | "quote" | "hold" | "commit"

const STEP_ORDER: readonly BookingJourneyStep[] = ["create", "quote", "hold", "commit"]

/**
 * Cap on remembered Sessions. A long-lived Node host serves an unbounded
 * number of Sessions, so the map is an LRU rather than a leak: dropping the
 * oldest entry costs a less precise `last_step` on a Session nobody has
 * touched in a very long time.
 */
const MAX_TRACKED_SESSIONS = 2_000

export interface BookingSessionAnalyticsOptions {
  analytics: AnalyticsEmitter
  /** Monotonic-enough clock for durations. Injectable so tests are not timing-dependent. */
  clock?: () => number
}

export function withBookingSessionAnalytics(
  module: BookingSessionModule,
  options: BookingSessionAnalyticsOptions,
): BookingSessionModule {
  const { analytics } = options
  const clock = options.clock ?? (() => Date.now())
  const progress = new Map<string, SessionProgress>()

  function remember(sessionId: string, step: BookingJourneyStep, quotedAtMs?: number): void {
    const current = progress.get(sessionId)
    const lastStep =
      current && STEP_ORDER.indexOf(current.lastStep) > STEP_ORDER.indexOf(step)
        ? current.lastStep
        : step
    const carried = quotedAtMs ?? current?.quotedAtMs
    // Re-inserting moves the key to the end of the iteration order, which is
    // what makes the eviction below least-recently-used rather than arbitrary.
    progress.delete(sessionId)
    progress.set(sessionId, {
      lastStep,
      ...(carried === undefined ? {} : { quotedAtMs: carried }),
    })
    if (progress.size > MAX_TRACKED_SESSIONS) {
      const oldest = progress.keys().next()
      if (!oldest.done) progress.delete(oldest.value)
    }
  }

  /**
   * Emit `engine.quote.expired` when a rejection says the live Quote aged out.
   *
   * It rides every method rather than only `quoteSession` because expiry is
   * discovered wherever the Quote is next used — usually Hold or Commit, which
   * is precisely the drop-off worth measuring.
   */
  function noteQuoteExpiry(sessionId: string, outcome: BookingSessionOutcomeV1): void {
    if (outcome.kind !== "rejected" || outcome.error.kind !== "quote_expired") return
    const quotedAtMs = progress.get(sessionId)?.quotedAtMs
    analytics.track(
      "engine.quote.expired",
      analyticsProperties({
        booking_session_id: sessionId,
        seconds_since_issue:
          quotedAtMs === undefined ? undefined : Math.round((clock() - quotedAtMs) / 1000),
      }),
    )
  }

  function trackCreated(outcome: BookingSessionOutcomeV1): BookingSessionOutcomeV1 {
    if (outcome.kind !== "session_created") return outcome
    remember(outcome.session.id, "create")
    analytics.track(
      "engine.session.created",
      analyticsProperties({
        booking_session_id: outcome.session.id,
        scope: outcome.session.scope.locale,
        market: outcome.session.scope.market,
        channel: sessionChannel(outcome.session),
      }),
    )
    return outcome
  }

  return {
    ...module,

    async previewOffer(input, access) {
      const outcome = await module.previewOffer(input, access)
      analytics.track("engine.offer.previewed", offerPreviewProperties(input.target, outcome))
      return outcome
    },

    async createSession(input, access) {
      return trackCreated(await module.createSession(input, access))
    },

    async createAcceptedProposalSession(input, access) {
      return trackCreated(await module.createAcceptedProposalSession(input, access))
    },

    async quoteSession(sessionId, input, access) {
      analytics.track("engine.quote.requested", { booking_session_id: sessionId })
      const startedAt = clock()
      const outcome = await module.quoteSession(sessionId, input, access)
      if (outcome.kind === "quote_created") {
        remember(sessionId, "quote", Date.parse(outcome.quote.quotedAt))
        analytics.track("engine.quote.succeeded", {
          booking_session_id: sessionId,
          duration_ms: clock() - startedAt,
          total: outcome.quote.pricing.total,
          currency: outcome.quote.pricing.currency,
        })
      } else {
        noteQuoteExpiry(sessionId, outcome)
        analytics.track("engine.quote.failed", {
          booking_session_id: sessionId,
          failure_reason: outcomeFailureReason(outcome),
        })
      }
      return outcome
    },

    async placeHold(sessionId, input, access) {
      analytics.track("engine.hold.requested", { booking_session_id: sessionId })
      const startedAt = clock()
      const outcome = await module.placeHold(sessionId, input, access)
      if (outcome.kind === "hold_created") {
        remember(sessionId, "hold")
        analytics.track("engine.hold.succeeded", {
          booking_session_id: sessionId,
          duration_ms: clock() - startedAt,
        })
      } else {
        noteQuoteExpiry(sessionId, outcome)
        analytics.track("engine.hold.failed", {
          booking_session_id: sessionId,
          failure_reason: outcomeFailureReason(outcome),
        })
      }
      return outcome
    },

    async commitSession(sessionId, input, access) {
      analytics.track("engine.commit.attempted", { booking_session_id: sessionId })
      const startedAt = clock()
      const outcome = await module.commitSession(sessionId, input, access)
      remember(sessionId, "commit")
      noteQuoteExpiry(sessionId, outcome)
      const resolution = commitResolution(outcome)
      if (resolution.kind === "succeeded") {
        progress.delete(sessionId)
        analytics.track(
          "engine.commit.succeeded",
          analyticsProperties({
            booking_session_id: sessionId,
            booking_id: resolution.bookingId,
            duration_ms: clock() - startedAt,
          }),
        )
      } else if (resolution.kind === "failed") {
        analytics.track(
          "engine.commit.failed",
          analyticsProperties({
            booking_session_id: sessionId,
            failure_reason: resolution.reason,
            missing_requirements: resolution.missingRequirements,
          }),
        )
      }
      // `pending` — payment_required, supplier_pending, component_commit_pending
      // — is neither. The attempt is recorded and the Session is still live; a
      // buyer who never comes back arrives in the funnel as
      // `engine.session.abandoned`, which is what actually happened.
      return outcome
    },

    async abandonSession(sessionId, input, access) {
      const outcome = await module.abandonSession(sessionId, input, access)
      if (outcome.kind === "session_abandoned") {
        const tracked = progress.get(sessionId)
        progress.delete(sessionId)
        analytics.track("engine.session.abandoned", {
          booking_session_id: sessionId,
          last_step: tracked?.lastStep ?? lastStepFromState(outcome.session.state),
          age_seconds: Math.max(
            0,
            Math.round(
              (Date.parse(outcome.session.updatedAt) - Date.parse(outcome.session.createdAt)) /
                1000,
            ),
          ),
        })
      }
      return outcome
    },
  }
}

function sessionChannel(session: BookingSessionRecordV1): string | undefined {
  // The Session record deliberately does not serialize its storefront origin,
  // so the channel a Session is attributable to is its actor kind: staff
  // Sessions come from the operator, everything else from a storefront.
  return session.actorKind === "staff" ? "operator" : "storefront"
}

/**
 * A Session whose progress this process never observed — created by another
 * instance, or before a restart. Its state is the only evidence left.
 */
function lastStepFromState(state: BookingSessionRecordV1["state"]): BookingJourneyStep {
  return state === "supplier_pending" || state === "component_pending" ? "commit" : "create"
}

function offerPreviewProperties(
  target: { kind: string } & Record<string, unknown>,
  outcome: OfferPreviewOutcomeV1,
): AnalyticsProperties {
  const previewed = outcome.kind === "offer_preview"
  return analyticsProperties({
    target_id: targetId(target as BookingSessionTargetV1),
    target_type: target.kind,
    priced: previewed && outcome.preview.pricing !== undefined,
    available: previewed && outcome.preview.available,
  })
}

function targetId(target: BookingSessionTargetV1): string | undefined {
  switch (target.kind) {
    case "product":
      return target.productId
    case "catalog_item":
      return target.catalogItemId
    case "owned_entity":
      return target.entityId
    case "trip_snapshot":
      return target.tripSnapshotId
    default:
      return undefined
  }
}

/**
 * The declared `failure_reason` for a non-success outcome.
 *
 * One rule, not a list of exceptions: **when a rejection carries a nested
 * `reason`, that reason is the failure reason.** `quote_unavailable` alone
 * says "it did not work"; `price_unavailable` says which of five distinct
 * things went wrong, and that is the difference between a number that moved
 * and a defect you can name. The nested vocabularies do not collide with each
 * other or with the wrapping kinds, so the enumeration stays flat and a
 * breakdown needs no second dimension.
 */
export function outcomeFailureReason(outcome: BookingSessionOutcomeV1): AnalyticsFailureReason {
  if (outcome.kind !== "rejected") return "unknown"
  return errorFailureReason(outcome.error)
}

export function errorFailureReason(error: BookingSessionLifecycleErrorV1): AnalyticsFailureReason {
  const nested = (error as { reason?: unknown }).reason
  return analyticsFailureReason(typeof nested === "string" ? nested : error.kind)
}

type CommitResolution =
  | { kind: "succeeded"; bookingId?: string }
  | { kind: "failed"; reason: AnalyticsFailureReason; missingRequirements?: readonly string[] }
  | { kind: "pending" }

/**
 * Split a Commit outcome three ways.
 *
 * Commit is the only leg whose success is not a single outcome kind: it can
 * complete, it can fail, and it can legitimately suspend waiting for a payment
 * guarantee or a supplier. Treating a suspension as either would misreport the
 * funnel in one direction or the other.
 */
export function commitResolution(outcome: BookingSessionOutcomeV1): CommitResolution {
  if (outcome.kind === "rejected") {
    const reason = errorFailureReason(outcome.error)
    return outcome.error.kind === "selection_incomplete"
      ? {
          kind: "failed",
          reason,
          missingRequirements: outcome.error.unsatisfied.map(
            (requirement) => requirement.requirementKey,
          ),
        }
      : { kind: "failed", reason }
  }
  if (outcome.kind !== "commit_result") return { kind: "pending" }

  const result =
    outcome.outcome.kind === "idempotent_replay" ? outcome.outcome.originalOutcome : outcome.outcome
  switch (result.kind) {
    case "committed":
      return { kind: "succeeded", bookingId: result.booking.id }
    case "component_bookings_committed":
      return { kind: "succeeded" }
    case "supplier_failed":
    case "revision_mismatch":
    case "quote_failure":
    case "hold_failure":
    case "proposal_acceptance_required":
      return { kind: "failed", reason: analyticsFailureReason(result.kind) }
    default:
      return { kind: "pending" }
  }
}
